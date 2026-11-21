"""Ролики-инструкции для кнопки «?» (help/<экран>.mp4 + .jpg).

Приложение на тестовых данных (без реальных клиентов), нажатия по сценарию, место нажатия
подсвечивается кругом. Запись Playwright (webm) → ffmpeg → MP4 H.264 без звука.

  python3 help_videos.py                 # все ролики
  python3 help_videos.py sales,orders    # выбранные
"""
import json, os, shutil, subprocess, sys, threading, http.server, tempfile, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'help')
W, H = 390, 700                       # область, которая видна в окне инструкции

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split('?')[0]
        for pre in ('/pwa/', '/app/'):
            if p.startswith(pre):
                p = p[len(pre) - 1:]
        return os.path.join(ROOT, p.lstrip('/'))

    def log_message(self, *a):
        pass

srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8770), Handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:8770'

UPD = '21.11.2026 10:15'
CPS = [
    {"name": "ООО «Вкусный дом»", "full_name": "ООО «Вкусный дом»", "guid": "g1", "manager_uuid": "u1"},
    {"name": "ООО «Гастроном №1»", "full_name": "ООО «Гастроном №1»", "guid": "g2", "manager_uuid": "u1"},
    {"name": "ИП Петров А. В.", "full_name": "Индивидуальный предприниматель Петров А. В.", "guid": "g3", "manager_uuid": "u1"},
    {"name": "Кафе «Лето»", "full_name": "ООО «Лето»", "guid": "g4", "manager_uuid": "u1"},
]
NOMEN = [{"name": "Сыр российский 50%", "guid": "n1"}, {"name": "Масло сливочное 82,5%", "guid": "n2"},
         {"name": "Сметана 20%", "guid": "n3"}]
MANAGERS = [{"name": "Иванова Анна", "uuid": "u1", "guid": "u1"}]

DATA = {
    'orders.json': {"updated_at": UPD, "rows": [
        {"id": "o1", "detail": "/files/u1/order_1.json", "values": ["", "ООО «Вкусный дом»", "000123", "45 300", "10:30"]},
        {"id": "o2", "detail": "/files/u1/order_2.json", "values": ["", "Кафе «Лето»", "000124", "12 800", "12:00"]},
        {"id": "o3", "detail": "/files/u1/order_3.json", "values": ["", "ООО «Гастроном №1»", "000125", "28 450", "14:00"]}]},
    'order_1.json': {"fields": [["Контрагент", "ООО «Вкусный дом»"], ["Номер", "000123"], ["Сумма", "45 300"], ["Доставка", "22.11.2026, 10:00–12:00"]],
                     "line_columns": ["Номенклатура", "Кол-во", "Цена", "Сумма"],
                     "lines": [["Сыр российский 50%", "20 кг", "650", "13 000"], ["Масло сливочное 82,5%", "30 кг", "890", "26 700"], ["Сметана 20%", "20 шт", "280", "5 600"]]},
    'sales.json': {"period": {"from": "01.11.2026", "to": "21.11.2026"}, "rows": [
        ["", "Иванова Анна", "", "0"],
        ["", "Иванова Анна", "ООО «Вкусный дом»", "1 245 300"], ["", "Иванова Анна", "ООО «Гастроном №1»", "386 120"],
        ["", "Иванова Анна", "Кафе «Лето»", "92 450"], ["", "Иванова Анна", "", "1 723 870"]]},
    'debt.json': {"updated_at": UPD, "rows": [{"Имя": "Иванова Анна", "Долг": "312 000", "Просрочка": "40 000", "children": [
        {"Имя": "ООО «Вкусный дом»", "GUID": "g1", "Долг": "200 000", "Просрочка": "40 000", "Дни": "12", "Блок": False, "children": [
            {"Имя": "Реализация 000098 от 01.11.2026", "Долг": "120 000", "Просрочка": "40 000", "Дни": "-5", "Переделка": False},
            {"Имя": "Реализация 000110 от 12.11.2026", "Долг": "80 000", "Просрочка": "0", "Дни": "4", "Переделка": False}]},
        {"Имя": "Кафе «Лето»", "GUID": "g4", "Долг": "62 000", "Просрочка": "0", "Дни": "3", "Блок": True, "ПричинаБлока": "Превышен лимит", "children": [
            {"Имя": "Реализация 000115 от 18.11.2026", "Долг": "62 000", "Просрочка": "0", "Дни": "3", "Переделка": False}]},
        {"Имя": "ООО «Гастроном №1»", "GUID": "g2", "Долг": "50 000", "Просрочка": "0", "Дни": "7", "Блок": False, "children": []}]}]},
    'prices.json': [{"counterparty": "ООО «Вкусный дом»", "date": "21.11.2026", "items": [
        {"name": "Сыр российский 50%", "price": "650", "total": "650"}]}],
}
FILES = []
status_calls = {}


def api(route):
    url = route.request.url
    if '/api/directory/counterparties' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(CPS, ensure_ascii=False))
    if '/api/directory/managers' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(MANAGERS, ensure_ascii=False))
    if '/api/directory/' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(NOMEN, ensure_ascii=False))
    if url.endswith('/api/task') and route.request.method == 'POST':
        return route.fulfill(status=200, content_type='application/json', body='{"success":true,"uuid":"t1"}')
    if '/api/task/' in url and '/status' in url:
        n = status_calls['t1'] = status_calls.get('t1', 0) + 1
        st = 'ready' if n >= 2 else 'writing'
        return route.fulfill(status=200, content_type='application/json', body=json.dumps({"status": st}))
    if '/api/files' in url:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(FILES, ensure_ascii=False))
    if '/api/messages' in url:
        return route.fulfill(status=200, content_type='application/json', body='{"messages":[],"unread":0}')
    return route.fulfill(status=200, content_type='application/json', body='{"success":true}')


def files(route):
    name = route.request.url.split('/files/u1/')[1].split('?')[0]
    if name in DATA:
        return route.fulfill(status=200, content_type='application/json', body=json.dumps(DATA[name], ensure_ascii=False))
    return route.fulfill(status=404, body='')


FONT_CSS = """@font-face{font-family:'Golos Text';font-weight:400;src:local('Inter')}
@font-face{font-family:'Golos Text';font-weight:500;src:local('Inter Medium')}
@font-face{font-family:'Golos Text';font-weight:600;src:local('Inter SemiBold')}
@font-face{font-family:'Golos Text';font-weight:700;src:local('Inter Bold')}
@font-face{font-family:'Pacifico';src:local('TeX Gyre Chorus')}"""

# круг в месте нажатия — в записи видно, куда нажимать
TAP_JS = """
(() => {
  const css = document.createElement('style');
  css.textContent = `.__tap{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;
    background:rgba(181,224,138,.45);border:2px solid #B5E08A;pointer-events:none;z-index:99999;
    animation:__tap .6s ease-out forwards}
    @keyframes __tap{from{transform:scale(.4);opacity:1}to{transform:scale(1.3);opacity:0}}`;
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  document.addEventListener('pointerdown', e => {
    const d = document.createElement('div'); d.className='__tap';
    d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px';
    document.body.appendChild(d); setTimeout(() => d.remove(), 700);
  }, true);
  window.alert = () => {};
})();
"""


class Shot:
    def __init__(self, page):
        self.p = page

    def pause(self, ms=900):
        self.p.wait_for_timeout(ms)

    def tap(self, selector, after=1000):
        el = self.p.locator(selector).first
        el.scroll_into_view_if_needed()
        box = el.bounding_box()
        self.p.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2, steps=8)
        self.pause(250)
        el.click()
        self.pause(after)

    def type(self, selector, text, after=700):
        self.tap(selector, after=300)
        self.p.locator(selector).first.type(text, delay=90)
        self.pause(after)

    def pick(self, field, name):
        self.tap(field, after=900)
        self.tap(f'.modal-overlay >> text="{name}"', after=900)

    def menu(self, title):
        self.tap(f'.menu-card:has(.menu-card-title:text-is("{title}"))', after=1300)


SCENARIOS = {}


def scenario(fn):
    SCENARIOS[fn.__name__] = fn
    return fn


@scenario
def orders(s):
    s.menu('Заказы')
    s.tap('button:has-text("Получить заказы")')
    s.tap('.period-btn:has-text("Сегодня")', after=700)
    s.tap('.modal-window button:has-text("Получить")', after=4200)
    s.tap('.order-card >> nth=0', after=2200)


@scenario
def sales(s):
    s.menu('Продажи')
    s.tap('.report-actions .btn-wide')
    s.tap('.period-btn:has-text("Месяц")', after=700)
    s.tap('.modal-actions .btn-primary-wide', after=4200)
    s.tap('.report-section-head >> nth=0', after=700)
    s.tap('.report-section-head >> nth=0', after=1800)


@scenario
def debt(s):
    s.menu('Дебиторка')
    s.tap('button:has-text("Получить дебиторку")')
    s.tap('.modal-window button:has-text("Показать на экране")', after=4200)
    s.type('#debtSearch', 'лето', after=1500)
    s.p.locator('#debtSearch').fill('')
    s.p.locator('#debtSearch').dispatch_event('input')
    s.pause(1500)


def files_scenario(title, field, button, name):
    def run(s):
        s.menu(title)
        s.pick(field, 'ООО «Вкусный дом»')
        s.tap(f'button:has-text("{button}")', after=1200)
        FILES.append({"name": name, "mtime": int(time.time() * 1000), "size": 48000})
        s.tap('#navFiles', after=2200)
    return run


SCENARIOS['bills'] = files_scenario('Счета', '#billsCounterparty', 'Получить счета', 'bill_000123_Вкусный_дом.pdf')
SCENARIOS['act'] = files_scenario('Акт сверки', '#actCounterparty', 'Получить акт сверки', 'act_Вкусный_дом_ноябрь.pdf')
SCENARIOS['upd'] = files_scenario('УПД', '#updCounterparty', 'Получить УПД', 'upd_000123_Вкусный_дом.pdf')
SCENARIOS['pricelist'] = files_scenario('Прайс', '#pricelistCounterparty', 'Получить прайс', 'price_Вкусный_дом.xlsx')


@scenario
def prices(s):
    s.menu('Цены')
    s.pick('#pricesCounterparty', 'ООО «Вкусный дом»')
    s.type('#pricesSearch', 'сыр', after=600)
    s.tap('button:has-text("Получить цены")', after=4200)


def record(name, fn, browser):
    FILES.clear()
    status_calls.clear()
    tmp = tempfile.mkdtemp()
    ctx = browser.new_context(viewport={'width': W, 'height': H}, device_scale_factor=2,
                              record_video_dir=tmp, record_video_size={'width': W, 'height': H},
                              service_workers='block')
    ctx.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=FONT_CSS))
    ctx.route('**/api/**', api)
    ctx.route('**/files/u1/**', files)
    user = {"id": 1, "user_id": "u1", "name": "Иванова Анна", "role": "manager"}
    ctx.add_init_script(f"localStorage.setItem('jwt','x');localStorage.setItem('user',JSON.stringify({json.dumps(user, ensure_ascii=False)}));"
                        "localStorage.setItem('push_prompt_dismissed',String(Date.now()));")
    ctx.add_init_script(TAP_JS)
    page = ctx.new_page()
    errs = []
    page.on('pageerror', lambda e: errs.append(str(e)))
    t0 = time.time()
    page.goto(BASE + '/pwa/index.html')
    page.wait_for_timeout(1200)
    start = time.time() - t0                      # загрузку страницы из ролика вырезаем
    s = Shot(page)
    fn(s)
    s.pause(1200)
    video = page.video.path()
    ctx.close()
    mp4 = os.path.join(OUT, name + '.mp4')
    jpg = os.path.join(OUT, name + '.jpg')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{max(start - 0.3, 0):.2f}', '-i', video,
                    '-vf', 'fps=24', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], check=True)
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', '0.4', '-i', mp4, '-frames:v', '1',
                    '-q:v', '5', jpg], check=True)
    shutil.rmtree(tmp, ignore_errors=True)
    dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4],
                         capture_output=True, text=True).stdout.strip()
    print(f'{name:10} {os.path.getsize(mp4) // 1024:5} КБ  {float(dur):4.1f} с  ошибки: {errs or 0}')


names = sys.argv[1].split(',') if len(sys.argv) > 1 else list(SCENARIOS)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome')
    for n in names:
        record(n, SCENARIOS[n], b)
    b.close()
srv.shutdown()
