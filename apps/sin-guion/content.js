// Fixed, human-authored course: the six grammar blocks and seven oral themes of the module.
// Each exercise: [prompt, correct answer, distractor A, distractor B, explanation].
export const GRAMMAR = [
  {
    id:'past', title:'Indefinido / Imperfecto', short:'Два прошедших',
    description:'Что произошло — или каким всё было?',
    rule:'Indefinido показывает завершённое событие: ayer fui al cine. Imperfecto — фон, привычку или длительное состояние: cuando era niño, iba al cine. В рассказе обычно нужны оба времени.',
    formula:'Ayer fui · Antes iba · Mientras estudiaba, sonó el teléfono.',
    examples:[['Ayer vi una película.','Вчера посмотрел фильм: завершённое событие.'],['De niño veía dibujos animados.','В детстве смотрел мультфильмы: привычка.'],['Llovía cuando salimos.','Шёл дождь, когда мы вышли: фон + событие.']],
    items:[
      ['Ayer yo ___ una película española.','vi','veía','había visto','Ayer + завершённый просмотр → indefinido.'],
      ['Cuando era pequeño, ___ mucho con mi hermano.','jugaba','jugué','había jugado','Регулярная привычка в прошлом → imperfecto.'],
      ['Mientras nosotros ___, llegó Ana.','comíamos','comimos','habíamos comido','Действие в процессе на фоне другого → imperfecto.'],
      ['El año pasado ___ a Madrid por primera vez.','viajé','viajaba','viajía','Конкретная завершённая поездка → indefinido.'],
      ['Antes mi ciudad ___ mucho más tranquila.','era','fue','había sido','Описание состояния в прошлом → imperfecto.'],
      ['De repente, el móvil ___.','sonó','sonaba','había sonado','Внезапное событие → indefinido.'],
      ['Todos los veranos mis amigos y yo ___ al mar.','íbamos','fuimos','habíamos ido','Повторяющаяся привычка → imperfecto.'],
      ['Anoche no ___ dormir bien.','pude','podía','podré','Конкретный результат прошедшей ночи → indefinido.'],
      ['Ella ___ cansada cuando la llamé.','estaba','estuvo','estará','Состояние в момент другого события → imperfecto.'],
      ['La semana pasada nosotros ___ el examen.','hicimos','hacíamos','haremos','Законченное событие с конкретным периодом → indefinido.']
    ]
  },
  {
    id:'plus',title:'Pretérito pluscuamperfecto',short:'Прошлое до прошлого',
    description:'Что уже случилось до другого события?',
    rule:'Pluscuamperfecto = había / habías / había / habíamos / habíais / habían + participio (-ado/-ido). Обозначает событие, которое произошло раньше другого момента в прошлом.',
    formula:'Cuando llegué, ya habían salido.',
    examples:[['Cuando llegué, la película ya había empezado.','Когда я пришёл, фильм уже начался.'],['Nunca había probado esa comida.','До того момента я никогда не пробовал эту еду.'],['Ella había hecho la tarea antes de salir.','Сначала сделала домашнее задание, потом вышла.']],
    items:[
      ['Cuando llegué, mis amigos ya ___ salido.','habían','han','había','Mis amigos — третье лицо множественного числа: habían.'],
      ['Yo nunca ___ visto esa serie antes.','había','habían','he','Yo → había + participio.'],
      ['Cuando empezó la clase, nosotros ya ___ estudiado.','habíamos','habíamos sido','habían','Nosotros → habíamos estudiado.'],
      ['Antes de viajar, ella había ___ los billetes.','comprado','compró','compraba','После había используется participio: comprado.'],
      ['El profesor preguntó si yo ___ hecho la tarea.','había','hube','he','Для более раннего действия в прошлом → había hecho.'],
      ['Cuando entré, la fiesta ya había ___.','terminado','terminó','terminaba','Participio глагола terminar — terminado.'],
      ['Nosotros ya ___ comido cuando llegaron.','habíamos','hemos','habían','Nosotros → habíamos comido.'],
      ['Nunca habías ___ tanta nieve.','visto','viste','veías','Неправильное participio ver — visto.'],
      ['Ella no había ___ la puerta.','abierto','abrido','abrió','Неправильное participio abrir — abierto.'],
      ['Cuando llamaron, tú ya te ___ dormido.','habías','había','has','Tú → te habías dormido.']
    ]
  },
  {
    id:'desde',title:'Desde / Desde hace / Desde que',short:'С каких пор?',
    description:'Точка, длительность или событие.',
    rule:'Desde + точка начала (desde 2022, desde el lunes). Desde hace + промежуток времени (desde hace tres años). Desde que + целая придаточная часть с глаголом (desde que me mudé). Для продолжающихся ситуаций часто используется настоящее время.',
    formula:'Desde 2022 · Desde hace dos años · Desde que llegué.',
    examples:[['Estudio español desde 2024.','Учу с 2024 года: точка начала.'],['Estudio español desde hace dos años.','Учу уже два года: длительность.'],['Estudio español desde que entré en la universidad.','Учу с тех пор, как поступил.']],
    items:[
      ['Vivo aquí ___ 2023.','desde','desde hace','desde que','2023 — точка начала.'],
      ['Estudio español ___ dos años.','desde hace','desde','desde que','Dos años — продолжительность.'],
      ['Me gusta el cine español ___ vi esa película.','desde que','desde hace','desde','После выражения идёт придаточное с глаголом vi.'],
      ['No lo veo ___ el lunes.','desde','desde hace','desde que','El lunes — конкретная точка отсчёта.'],
      ['Trabajo aquí ___ seis meses.','desde hace','desde que','desde','Seis meses — длительность.'],
      ['Estoy más contento ___ terminé los exámenes.','desde que','desde hace','desde','Terminé — глагол в придаточном.'],
      ['Nos conocemos ___ la infancia.','desde','desde hace','desde que','La infancia — период как точка отсчёта.'],
      ['No he comido ___ ocho horas.','desde hace','desde que','desde','Ocho horas — промежуток времени.'],
      ['___ me mudé, uso más el metro.','Desde que','Desde hace','Desde','Me mudé — придаточное предложение.'],
      ['Mi hermana está en España ___ abril.','desde','desde hace','desde que','Abril — календарная точка.']
    ]
  },
  {
    id:'future',title:'Futuro simple',short:'Будущее',
    description:'Прогнозы, обещания и предположения.',
    rule:'Инфинитив + é, ás, á, emos, éis, án. У неправильных меняется основа: tener → tendr-, hacer → har-, poder → podr-, haber → habr-, decir → dir-, salir → saldr-, venir → vendr-.',
    formula:'Viviré · Viviremos · Tendrán · Habrá.',
    examples:[['Las ciudades serán más verdes.','Города станут зеленее.'],['En el futuro habrá menos coches.','В будущем будет меньше машин.'],['Mañana estudiaré español.','Завтра буду заниматься испанским.']],
    items:[
      ['En el futuro los coches ___ eléctricos.','serán','serían','son','Прогноз для ellos → serán.'],
      ['Mañana yo ___ para el examen.','estudiaré','estudiaba','estudié','Yo → estudiaré.'],
      ['Nosotros ___ más tiempo libre.','tendremos','tenemos','teneremos','Tener имеет основу tendr- → tendremos.'],
      ['En 2050 ___ muchas ciudades inteligentes.','habrá','había','hay','Безличное haber в будущем → habrá.'],
      ['¿Qué ___ tú el próximo año?','harás','hacerás','hiciste','Hacer → harás.'],
      ['Ellos ___ viajar a Marte algún día.','podrán','poderán','podían','Poder → podrán.'],
      ['Yo te ___ la verdad mañana.','diré','deciré','dije','Decir → diré.'],
      ['La tecnología ___ nuestras vidas.','cambiará','cambiaba','cambió','Она изменит → cambiará.'],
      ['¿Vosotros ___ a la fiesta?','vendréis','veniréis','vinisteis','Venir → vendr- + éis.'],
      ['El tren ___ a las ocho.','saldrá','salirá','saleó','Salir → saldr- + á.']
    ]
  },
  {
    id:'conditional',title:'Condicional de primer tipo',short:'Если → то',
    description:'Реальное условие и возможный результат.',
    rule:'Si + presente de indicativo, + futuro simple (или presente / imperativo). После si в реальном условии НЕ используем futuro и НЕ используем presente de subjuntivo.',
    formula:'Si estudio, aprobaré. / Si tienes tiempo, ven.',
    examples:[['Si practico todos los días, mejoraré.','Если буду заниматься каждый день, стану лучше.'],['Si tengo tiempo, veré una película.','Если будет время, посмотрю фильм.'],['Si hace buen tiempo, iremos al parque.','Если будет хорошая погода, пойдём в парк.']],
    items:[
      ['Si ___ más, aprobaré el examen.','estudio','estudiaré','estudie','После si в условии первого типа → presente indicativo.'],
      ['Si tenemos tiempo, ___ al cine.','iremos','fuéramos','íbamos','В результате допустим futuro: iremos.'],
      ['Si mañana ___, me quedaré en casa.','llueve','lloverá','llueva','После si → llueve.'],
      ['Si tú me ayudas, yo te ___.','ayudaré','ayudaba','ayude','В результате → futuro simple.'],
      ['Si las ciudades son más verdes, ___ menos contaminación.','habrá','habría','haya','Реальный прогноз: habrá.'],
      ['Si no ___, perderás el autobús.','sales','saldrás','salgas','После si → presente de indicativo: sales.'],
      ['Si comemos mejor, ___ más sanos.','estaremos','estaríamos','estábamos','В результате → estaremos.'],
      ['Si ella ___, podremos empezar.','viene','vendrá','venga','После si → viene, не vendrá и не venga.'],
      ['Si estudias mucho, ___ el idioma.','aprenderás','aprendas','aprendías','Результат в будущем → aprenderás.'],
      ['Si no lo entiendes, me ___.','preguntarás','preguntes','preguntabas','Допустимый вариант: me preguntarás (будущее).']
    ]
  },
  {
    id:'subj',title:'Presente de subjuntivo',short:'Желания и советы',
    description:'Quiero que · Espero que · Recomiendo que.',
    rule:'Для желаний, просьб и рекомендаций с разными субъектами: quiero / espero / recomiendo que + presente de subjuntivo. У -ar окончания e, es, e, emos, éis, en; у -er/-ir — a, as, a, amos, áis, an. Неправильные: ser → sea, ir → vaya, tener → tenga, hacer → haga, estar → esté.',
    formula:'Espero que tengas suerte. / Recomiendo que descanses.',
    examples:[['Espero que tengas tiempo.','Надеюсь, что у тебя будет время.'],['Quiero que mi ciudad sea más limpia.','Хочу, чтобы мой город стал чище.'],['Te recomiendo que duermas más.','Советую тебе больше спать.']],
    items:[
      ['Espero que tú ___ bien el examen.','hagas','haces','harás','Espero que → subjuntivo; hacer → hagas.'],
      ['Quiero que las ciudades ___ más verdes.','sean','son','serán','Quiero que → sean (ser).'],
      ['Te recomiendo que ___ más agua.','bebas','bebes','beberás','Рекомендация → bebas (beber).'],
      ['Es necesario que nosotros ___ cada día.','estudiemos','estudiamos','estudiaremos','Necesario que → estudiemos.'],
      ['Espero que ella ___ mañana.','venga','viene','vendrá','Venir → venga в subjuntivo.'],
      ['Quiero que mis amigos ___ felices.','estén','están','estarán','Estar → estén.'],
      ['Te pido que me ___ la verdad.','digas','dices','dirás','Decir → digas.'],
      ['Es importante que tú ___ suficiente.','duermas','duermes','dormirás','Dormir меняет o→ue: duermas.'],
      ['Ojalá ___ buen tiempo mañana.','haga','hace','hará','Ojalá + subjuntivo → haga.'],
      ['Recomiendo que ustedes ___ al médico.','vayan','van','irán','Ir → vayan в subjuntivo.']
    ]
  }
];

export const TOPICS = [
  {
    id:'first',title:'Primeras experiencias',ru:'Первый опыт',badge:'01 / PASADO',
    intro:'Расскажи о том, что сделал впервые, как это происходило и что было до этого.',
    questions:['¿Cuál fue tu primera experiencia importante?','¿Cómo te sentías antes y después?','¿Habías hecho algo parecido antes?','¿Qué aprendiste de esa experiencia?','¿Qué hacías cuando eras niño?'],
    vocab:[['por primera vez','в первый раз'],['al principio','сначала'],['tenía miedo','я боялся'],['me di cuenta de que','я понял, что'],['antes de eso','до этого'],['cuando era pequeño','когда я был маленьким']],
    starters:['La primera vez que...','Antes de eso, nunca había...','Al principio estaba..., pero después...'],
    targets:['past','plus']
  },
  {
    id:'cinema',title:'Cine español',ru:'Испанское кино',badge:'02 / CULTURA',
    intro:'Поговори о фильмах, сериалах, кинофестивалях и премиях Испании.',
    questions:['¿Qué sabes sobre el cine español?','¿Qué películas o series españolas conoces?','¿Prefieres las series o las películas? ¿Por qué?','¿Qué son los Premios Goya?','¿Qué importancia tienen los festivales de cine?'],
    vocab:[['una película','фильм'],['una serie','сериал'],['un director / una directora','режиссёр'],['los Premios Goya','премия «Гойя»'],['el Festival de San Sebastián','кинофестиваль в Сан-Себастьяне'],['el argumento','сюжет']],
    starters:['En mi opinión, el cine español...','Conozco la película / la serie...','Creo que los festivales son importantes porque...'],
    targets:['past','subj']
  },
  {
    id:'cities',title:'Ciudades del futuro',ru:'Города будущего',badge:'03 / FUTURO',
    intro:'Опиши, какими станут города и какие изменения хотелось бы увидеть.',
    questions:['¿Cómo serán las ciudades del futuro?','¿Qué transporte utilizaremos?','¿Cómo resolveremos la contaminación?','¿Qué pasará si usamos más energía limpia?','¿Qué quieres que cambie en tu ciudad?'],
    vocab:[['el transporte público','общественный транспорт'],['la contaminación','загрязнение'],['la energía renovable','возобновляемая энергия'],['los edificios inteligentes','умные здания'],['los espacios verdes','зелёные зоны'],['los coches autónomos','беспилотные автомобили']],
    starters:['En el futuro habrá...','Si usamos..., tendremos...','Espero que las ciudades sean...'],
    targets:['future','conditional','subj']
  },
  {
    id:'food',title:'Alimentación del futuro',ru:'Еда будущего',badge:'04 / FUTURO',
    intro:'Поразмышляй о технологиях питания, экологии и привычках.',
    questions:['¿Qué comeremos en el futuro?','¿Comeremos menos carne? ¿Por qué?','¿Qué piensas de la comida cultivada en laboratorio?','¿Qué pasará si cambiamos nuestra dieta?','¿Qué alimentos recomendarías a tus amigos?'],
    vocab:[['la carne cultivada','выращенное мясо'],['una dieta equilibrada','сбалансированное питание'],['los alimentos sostenibles','экологичные продукты'],['la salud','здоровье'],['las verduras','овощи'],['reducir los residuos','сократить отходы']],
    starters:['Creo que comeremos...','Si cambiamos nuestra dieta...','Es importante que comamos...'],
    targets:['future','conditional','subj']
  },
  {
    id:'technology',title:'Tecnología del futuro',ru:'Технологии будущего',badge:'05 / FUTURO',
    intro:'Представь роль ИИ, роботов и технологий в повседневной жизни.',
    questions:['¿Cómo cambiará la inteligencia artificial nuestras vidas?','¿Qué trabajos harán los robots?','¿Cuáles serán los riesgos de la tecnología?','¿Qué pasará si dependemos demasiado de la tecnología?','¿Qué tecnología quieres que inventen?'],
    vocab:[['la inteligencia artificial','искусственный интеллект'],['los robots','роботы'],['el trabajo a distancia','удалённая работа'],['la privacidad','приватность'],['las ventajas y desventajas','преимущества и недостатки'],['la automatización','автоматизация']],
    starters:['La tecnología nos permitirá...','Si usamos la inteligencia artificial...','Espero que la tecnología ayude a...'],
    targets:['future','conditional','subj']
  },
  {
    id:'dreams',title:'Los sueños y cómo cumplirlos',ru:'Мечты и цели',badge:'06 / PERSONAL',
    intro:'Расскажи, чего хочешь добиться и как будешь двигаться к цели.',
    questions:['¿Cuál es tu sueño más importante?','¿Qué harás para cumplirlo?','¿Qué dificultades puedes encontrar?','¿Quién te ha ayudado hasta ahora?','¿Qué esperas que pase en los próximos años?'],
    vocab:[['cumplir un sueño','осуществить мечту'],['una meta','цель'],['el esfuerzo','усилие'],['tener éxito','добиться успеха'],['aprender de los errores','учиться на ошибках'],['paso a paso','шаг за шагом']],
    starters:['Mi sueño es...','Para conseguirlo, estudiaré...','Espero que en el futuro pueda...'],
    targets:['future','conditional','subj']
  },
  {
    id:'siesta',title:'Beneficios del descanso y la siesta',ru:'Отдых и сиеста',badge:'07 / SALUD',
    intro:'Объясни, почему отдых важен и как можно улучшить режим.',
    questions:['¿Por qué es importante descansar?','¿Qué sabes de la siesta en España?','¿Cuántas horas duermes normalmente?','¿Qué haces cuando no has dormido bien?','¿Qué recomiendas a una persona que duerme poco?'],
    vocab:[['la siesta','дневной сон'],['descansar','отдыхать'],['dormir lo suficiente','достаточно спать'],['la concentración','концентрация'],['reducir el estrés','сократить стресс'],['recuperar energía','восстановить силы']],
    starters:['Dormir bien es importante porque...','Cuando no descanso, me siento...','Recomiendo que las personas duerman...'],
    targets:['desde','subj']
  }
];

export const PHRASES = [
  ['En mi opinión...','По моему мнению...','argument'],
  ['Creo que...','Я считаю, что...','argument'],
  ['Por ejemplo...','Например...','argument'],
  ['Por un lado... por otro lado...','С одной стороны... с другой...','argument'],
  ['Además...','Кроме того...','argument'],
  ['Sin embargo...','Однако...','argument'],
  ['Por eso...','Поэтому...','argument'],
  ['En primer lugar...','Во-первых...','argument'],
  ['En conclusión...','В заключение...','argument'],
  ['No estoy completamente seguro, pero...','Я не совсем уверен, но...','argument'],
  ['Cuando era pequeño...','Когда я был маленьким...','past'],
  ['Una vez...','Однажды...','past'],
  ['Al principio...','Вначале...','past'],
  ['Antes de eso, ya había...','До этого я уже...','plus'],
  ['Nunca había...','Я никогда до того не...','plus'],
  ['Desde hace unos años...','Уже несколько лет...','desde'],
  ['Desde que empecé...','С тех пор как я начал...','desde'],
  ['En el futuro habrá...','В будущем будет...','future'],
  ['Creo que tendremos...','Думаю, у нас будет...','future'],
  ['Si tengo tiempo, ...','Если у меня будет время, ...','conditional'],
  ['Si usamos menos..., habrá...','Если мы будем меньше использовать..., будет...','conditional'],
  ['Espero que...','Надеюсь, что... (+ subjuntivo)','subj'],
  ['Quiero que...','Хочу, чтобы... (+ subjuntivo)','subj'],
  ['Es importante que...','Важно, чтобы... (+ subjuntivo)','subj'],
  ['Te recomiendo que...','Советую тебе... (+ subjuntivo)','subj']
];

export const DAY_PLAN = [
  {title:'Научиться рассказывать о прошлом',focus:['past'],topic:['first'],tip:'Начинай с indefinido и добавляй фон через imperfecto.'},
  {title:'Показать последовательность событий',focus:['plus','desde'],topic:['first','siesta'],tip:'Используй había + participio и три конструкции desde.'},
  {title:'Строить прогнозы и условия',focus:['future','conditional'],topic:['cities','technology'],tip:'После si — presente, в результате — futuro.'},
  {title:'Желания, советы и просьбы',focus:['subj'],topic:['dreams','siesta'],tip:'Quiero que / Espero que / Recomiendo que + subjuntivo.'},
  {title:'Уверенно говорить на знакомые темы',focus:['past','subj'],topic:['cinema','food'],tip:'Сначала связность, потом точность форм.'},
  {title:'Пробный устный экзамен',focus:['conditional','future','subj'],topic:['cities','technology','dreams'],tip:'Без подсказок. Затем прослушай себя и отметь слабые места.'},
  {title:'Последнее повторение',focus:['past','plus','desde','future','conditional','subj'],topic:['first','cinema','cities','food','technology','dreams','siesta'],tip:'Повторяй ошибки, не заучивай новые монологи.'}
];
export const TOTAL_QUESTIONS = GRAMMAR.reduce((n,g)=>n+g.items.length,0);
