// The finale is purely presentational. The reader stays mounted underneath,
// and the user may skip immediately. No hidden story data or network calls.
export function finaleCurtain({count=0,escape}={}){
 const label=String(Math.max(0,Math.trunc(Number(count)||0))).padStart(2,'0');
 return '<div class="print-finale" role="presentation"><div class="print-finale-stack" aria-hidden="true"><i></i><i></i><i></i><span class="print-finale-seal">ГОТОВО</span></div><div class="print-finale-heading"><span class="eyebrow">РЕДАКЦІЯ ЗАВЕРШИЛА РОБОТУ</span><h2>Випуск готовий</h2><p>Розкриваємо '+label+' рукописів</p></div><button class="print-finale-skip" data-act="skip-finale" type="button">Читати зараз →</button></div>';
}
