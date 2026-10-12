// Drawn icons: 34 original schematic pictograms; no external image dependencies.
export const GLYPHS = [
 ['sun','Солнце'],['moon','Луна'],['star','Звезда'],['cloud','Облако'],
 ['rain','Дождь'],['wave','Вода'],['fire','Огонь'],['tree','Дерево'],
 ['flower','Цветок'],['bird','Птица'],['fish','Рыба'],['cat','Кот'],
 ['human','Человек'],['eye','Глаз'],['heart','Сердце'],['key','Ключ'],
 ['crown','Корона'],['house','Дом'],['door','Дверь'],['boat','Лодка'],
 ['mountain','Гора'],['arrow','Стрелка'],['clock','Часы'],['question','Вопрос'],
 ['hand','Рука'],['book','Книга'],['sword','Меч'],['dragon','Дракон'],
 ['not','Нет / зачеркнуть'],['swap','Обмен'],['loop','Повтор'],
 ['path','Путь'],['mask','Притворство'],['spark','Изменение']
];
const SHAPES = {
 sun:'<circle cx="32" cy="32" r="12"/><path d="M32 5v11m0 32v11M5 32h11m32 0h11M13 13l8 8m22 22 8 8M51 13l-8 8M21 43l-8 8"/>',
 moon:'<path d="M43 7A25 25 0 1 0 57 48 24 24 0 0 1 43 7Z"/>',
 star:'<path d="m32 5 8 18 20 2-15 13 5 20-18-11-18 11 5-20L4 25l20-2Z"/>',
 cloud:'<path d="M13 46C0 43 5 26 18 27c1-23 32-24 35-2 16 1 15 25-2 25H16"/>',
 rain:'<path d="M9 28c0-11 17-14 21-4 6-15 29-4 25 9H10M18 42l-4 11m20-11-4 11m20-11-4 11"/>',
 wave:'<path d="M3 23c10-14 18 14 29 0s18 14 29 0M3 39c10-14 18 14 29 0s18 14 29 0"/>',
 fire:'<path d="M35 4c12 16-4 21 8 30 5-5 6-9 6-9 15 25-1 36-18 36C5 61 9 36 19 22c-1 14 6 15 16-18Z"/><path d="M31 39c8 8 5 16 0 16-9 0-7-11 0-16Z"/>',
 tree:'<path d="M30 59V37M32 8 12 38h12l-13 10h42L40 38h12L32 8Z"/>',
 flower:'<circle cx="32" cy="29" r="7"/><path d="M32 22C18 2 10 25 25 28 2 27 11 48 28 35c-6 22 18 23 9 0 18 14 27-9 3-7 17-9 2-28-8-6M32 38v22m0-9-12-6m12-1 12-6"/>',
 bird:'<path d="M14 42C7 29 14 16 28 15c13-1 21 7 23 18l10 3-10 5c-3 12-17 17-28 11-6-4-12-6-18-7l9-9Z"/><path d="M21 30c7 2 14 7 15 17M24 53l-3 7m16-8 2 7"/><circle cx="43" cy="27" r="2.5" fill="currentColor" stroke="none"/>',
 fish:'<path d="M10 32c11-18 25-22 39-9l12-9v36l-12-9C35 54 21 50 10 32Z"/><circle cx="25" cy="30" r="2.5"/><path d="M40 22v20"/>',
 cat:'<path d="m12 25 1-16 14 10h10L51 9l1 16c12 23 0 34-20 34S0 48 12 25Z"/><circle cx="23" cy="36" r="3"/><circle cx="41" cy="36" r="3"/><path d="m28 44 4 3 4-3m-4 3v5m-13-8-11 1m37-1 11 1"/>',
 human:'<circle cx="32" cy="11" r="7"/><path d="M32 20v24m-18-8 18-13 18 13M32 44 18 59m14-15 14 15"/>',
 eye:'<path d="M3 32Q32-2 61 32 32 66 3 32Z"/><circle cx="32" cy="32" r="11"/><circle cx="32" cy="32" r="4" fill="currentColor" stroke="none"/>',
 heart:'<path d="M32 57 8 32C-4 18 12 3 26 17l6 7 6-7C52 3 68 18 56 32Z"/>',
 key:'<circle cx="20" cy="20" r="12"/><path d="m29 29 29 29m-9-9 8-8m-15 1 8-8"/>',
 crown:'<path d="M5 19 19 31l13-22 13 22 14-12-6 33H11Z"/><path d="M12 58h40"/>',
 house:'<path d="m5 30 27-23 27 23v28H5V30Z"/><path d="M24 58V37h16v21"/>',
 door:'<rect x="14" y="5" width="36" height="54" rx="2"/><path d="M21 59V12h22v47"/><circle cx="37" cy="36" r="2"/>',
 boat:'<path d="M4 42h56L48 58H18Z"/><path d="M32 8v34M28 12l-18 26h18m8-24 16 24H36"/>',
 mountain:'<path d="M3 56 24 12l10 21 8-14 19 37Z"/><path d="m17 27 7 10 6-7"/>',
 arrow:'<path d="M5 32h49m-19-20 20 20-20 20"/>',
 clock:'<circle cx="32" cy="32" r="25"/><path d="M32 15v17l14 8"/>',
 question:'<path d="M20 22a13 13 0 1 1 23 9c-7 5-11 7-11 13"/><circle cx="32" cy="55" r="2.5" fill="currentColor" stroke="none"/>',
 hand:'<path d="M17 36V15c0-7 9-8 9 0v16-23c0-7 9-7 9 0v23-19c0-7 9-7 9 0v23-11c0-7 9-7 9 0v17c0 26-36 25-42 5L5 35c-3-8 5-12 12 1Z"/>',
 book:'<path d="M32 14C20 7 10 6 4 10v41c10-4 19-3 28 4 9-7 18-8 28-4V10c-6-4-16-3-28 4Zm0 0v41"/>',
 sword:'<path d="M32 5 41 15 35 45l-3 5-3-5-6-30Z"/><path d="M14 44h36m-18 0v16"/>',
 dragon:'<path d="M9 54c-6-16 0-28 18-31L21 7l15 8 5-10 8 18 11 4-8 13-16-3c-6 17-16 20-27 17Z"/><path d="m10 39 10 3m26-13h2M20 31l-5-12"/>',
 not:'<circle cx="32" cy="32" r="24"/><path d="M14 50 50 14"/>',
 swap:'<path d="M9 23h40l-9-10m9 10-9 10M55 41H15l9-10m-9 10 9 10"/>',
 loop:'<path d="M16 20c16-20 43-6 43 13 0 24-36 35-49 10"/><path d="M10 27v16h16"/>',
 path:'<path d="M8 53c2-18 23-3 22-22S46 5 56 15" stroke-dasharray="4 6"/><path d="m41 15 15 0-2 15"/>',
 mask:'<path d="M9 11q23 10 46 0v20c0 18-12 26-23 29C20 56 9 49 9 31Z"/><path d="M16 30l12 3m20-3-12 3M24 44q8 9 16 0"/>',
 spark:'<path d="m32 4 6 18 19 10-19 7-6 21-7-21-19-7 19-10Z"/><path d="M51 4v10M46 9h10M7 49v10M2 54h10"/>'
};
export function glyphSVG(id, cls='') {
 const shape=SHAPES[id]||SHAPES.question;
 return '<svg class="'+cls+'" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+shape+'</svg>';
}
