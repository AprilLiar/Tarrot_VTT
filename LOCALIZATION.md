# Localization Mapping

The text of the app in English and Russian. **The app reads the Russian text from this file**: the page is
built with it, and the server reads it when it starts, so a fix made here goes live with the next deploy.

- Fix a translation by editing the right-hand cell. Keep every `{placeholder}` exactly as it is
  (`{name}`, `{n}` ...): the app fills them in. A pipe inside a text is written `\|`.
- The left column is the English text used in the app. It is the row's key, so do not change it here:
  change the text in the code and the row is renamed on the next sync. A missing translation shows the English text.
- New texts appear with an empty Russian cell (the check in CI fails until it is filled in).
- Rows are grouped by part of the app. Names typed by people (characters, items, scenes) are not translated.

## General

| English | Russian |
| --- | --- |
| Connecting... | Подключение... |
| on the user | на пользователя |
| on the targets | на цели |
| Base damage | Базовый урон |
| Damage type | Тип урона |
| True (ignores resistances) | Чистый (игнорирует сопротивления) |
| AP cost | Стоимость ОД |
| {name} stacks | Число накоплений: {name} |
| Remove {name} | Убрать: {name} |
| Add a status | Добавить состояние |
| Add status... | Добавить состояние... |
| Later | Позже |
| Advantage | Преимущество |
| Spontaneous Action | Спонтанное действие |
| Edit | Изменить |
| Clear | Очистить |
| Close | Закрыть |
| Cancel | Отмена |
| Use Help Dice? | Использовать кубики помощи? |
| Tap a die to add it to this roll, tap it again to put it back. A die you use is gone afterwards. | Коснитесь кубика, чтобы добавить его к этому броску, и коснитесь ещё раз, чтобы вернуть. Использованный кубик исчезает. |
| Proceed with {n} | Продолжить ({n}) |
| Proceed | Продолжить |
| Help Dice | Кубики помощи |
| Remove this die | Убрать этот кубик |
| Remove the d{sides} Help Die | Убрать кубик помощи d{sides} |
| None | Нет |
| Add a Help Die | Добавить кубик помощи |
| Add a d{sides} | Добавить d{sides} |
| Settings | Настройки |
| Who are you? | Кто вы? |
| Dismiss | Закрыть |
| Game Master | Мастер игры |
| Display Screen | Экран стола |
| Shows the current scene on the table screen | Показывает текущую сцену на экране стола |
| Player characters | Персонажи игроков |
| No characters yet. Ask the GM to create one. | Персонажей пока нет. Попросите мастера создать персонажа. |
| Name | Имя |
| PC | Игрок |
| NPC | НПС |
| Delete | Удалить |
| Saves waiting: {n} | Ожидают спасброски: {n} |
| Save for {name} | Спасбросок: {name} |
| Save against a status | Спасбросок против статуса |
| Save | Сохранить |
| DC | Сл |
| Modifiers | Модификаторы |
| Advantage {n} | Преимущество {n} |
| Disadvantage {n} | Помеха {n} |
| No Advantage or Disadvantage yet. | Преимущества и помехи пока нет. |
| AP to spend for Advantage (1 AP = 1 level) | ОД на преимущество (1 ОД = 1 уровень) |
| Less AP | Меньше ОД |
| More AP | Больше ОД |
| You have {n} AP. | У вас {n} ОД. |
| The Save is rolled normally. | Спасбросок без преимущества и помехи. |
| Rolled for the player: no AP is spent. | Бросок за игрока: ОД не тратятся. |
| Other Saves | Другие спасброски |
| Roll for them | Бросить за них |
| Roll Save | Бросить спасбросок |
| Sent to everyone. | Отправлено всем. |
| Set this for everyone, to the value you have now | Установить это всем на текущее значение |
| Apply to everyone | Применить ко всем |
| Language | Язык |
| Deadzone of the Area tool | Мёртвая зона инструмента «Область» |
| While dragging a new area, the striped Deadzone starts this many times the size of the area away from where you pressed. Letting go inside it cancels the area. | При создании области полосатая мёртвая зона начинается на столько размеров области от места нажатия. Отпустите кнопку внутри неё, чтобы отменить создание. |
| Status icon size in Battle | Размер значков статусов в бою |
| The size of the status icons on tokens, as a share of one grid square. A token shows as many icons as fit inside its square, the first applied. | Размер значков статусов на фишках в долях одной клетки сетки. Фишка показывает столько значков, сколько помещается в её квадрате, начиная с первых наложенных. |
| These settings are saved on this device only. | Эти настройки сохраняются только на этом устройстве. |
| Back | Назад |
| Characters | Персонажи |
| Scene | Сцена |
| Arcane | Аркана |
| Sheet | Лист |
| GM | МИ |
| Sections | Разделы |
| Reconnecting... | Переподключение... |
| Switch | Сменить |
| Item offered | Предложен предмет |
| {from} wants to give you {item}. | {from} хочет отдать вам предмет: {item}. |
| Decline | Отказаться |
| Accept | Принять |
| Duration | Длительность |
| Difficulty Class | Класс сложности |
| 8 + Experience Modifier + Prime | 8 + модификатор опыта + основная характеристика |
| Automatic | Автоматически |
| Manual | Вручную |
| {save} Save, DC | {save}, Сл |
| Locking mode | Режим блокировки |
| Locking mode: tap an open tab again to lock it, and tap a part to lock it. Players see a blur where something is locked; you see everything. | Режим блокировки: коснитесь открытой вкладки ещё раз, чтобы заблокировать её, и коснитесь части, чтобы заблокировать её. Игроки видят размытие на месте заблокированного; вы видите всё. |
| Open a character's Arcane tab to work with its Magic. Here you can lock its parts for the players. | Откройте вкладку Аркана персонажа, чтобы работать с его Магией. Здесь можно заблокировать её части для игроков. |
| Spell Stones | Камни заклинаний |
| Spell Combinations | Комбинации заклинаний |
| Spell Fine Tuning | Тонкая настройка заклинания |
| Open a character's Arcane tab to work with its Tarot Cards and Manifestations. Here you can lock them for the players. | Откройте вкладку Аркана персонажа, чтобы работать с его картами Таро и Проявлениями. Здесь можно заблокировать их для игроков. |
| Tarot Cards | Карты Таро |
| Manifestations | Проявления |
| Unarmed Attack | Атака без оружия |
| Default | Стандартное |
| Everyone | Для всех |
| This character | Этот персонаж |
| Fewer | Меньше |
| More | Больше |
| Chosen | Выбрано |
| Choose | Выбрать |
| Weapons | Оружие |
| Choose one weapon. Weapons are items with the Weapon switch on (see the Inventory on the sheet). | Выберите одно оружие. Оружие — это предметы с включённым переключателем «Оружие» (см. Инвентарь на листе). |
| Enhancements | Усиления |
| New Enhancement | Новое усиление |
| Targets | Цели |
| Delete Enhancement | Удалить усиление |
| Delete {name}? This cannot be undone. | Удалить: {name}? Это нельзя отменить. |
| Attacks need a Battle map. | Для атаки нужна карта боя. |
| Select a target first (in General). | Сначала выберите цель (во вкладке «Общее»). |
| Not enough AP: this attack costs {cost} and you have {have}. | Не хватает ОД: атака стоит {cost}, а у вас {have}. |
| The custom modifier must be a whole number from -99 to 99. | Свой модификатор должен быть целым числом от -99 до 99. |
| Stance: {name} | Стойка: {name} |
| Nothing chosen | Ничего не выбрано |
| {n} AP | {n} ОД |
| Options | Настройки |
| Done | Готово |
| Attack options | Параметры атаки |
| Extra Advantage levels | Дополнительные уровни преимущества |
| Fewer levels | Меньше уровней |
| More levels | Больше уровней |
| Custom modifier | Свой модификатор |
| Out of range | Вне дальности |
| Some targets are farther than the weapon's range of {range} Spaces: {list}. The range is only a suggestion. Attack anyway? | Некоторые цели дальше дальности оружия ({range} кл.): {list}. Дальность — лишь подсказка. Всё равно атаковать? |
| {name} ({n} Spaces) | {name} ({n} кл.) |
| No | Нет |
| Attack anyway | Всё равно атаковать |
| Edit Unarmed Attack | Изменить атаку без оружия |
| Enhancements for everyone | Усиления для всех |
| These are available to every PC and NPC, on top of Power Attack and Precise Attack. To make one for a single character, open its own Arcane tab. | Они доступны каждому ПИ и НИП, помимо Мощной и Точной атаки. Чтобы создать усиление для одного персонажа, откройте его вкладку Аркана. |
| None yet | Пока нет |
| You have not learned what this means for now | Вы пока не постигли, что это значит |
| Locked | Заблокировано |
| Open | Открыто |
| Stones | Камни |
| Editor | Редактор |
| Spell Drafts | Черновики заклинаний |
| Created Spells | Созданные заклинания |
| Magic | Магия |
| How many of each Spell Stone this character has. Crafting a spell spends them; drafting does not. | Сколько камней каждого вида у этого персонажа. Создание заклинания тратит их, черновик — нет. |
| {name} stones | Камни: {name} |
| A scheme can have at most {n} stones. | В схеме может быть не больше {n} камней. |
| Saved to Spell Drafts. | Сохранено в черновики заклинаний. |
| Saved to Spell Drafts, marked Illegal. | Сохранено в черновики с пометкой «Недопустимо». |
| New spell | Новое заклинание |
| Description | Описание |
| Add {name} | Добавить: {name} |
| Tap a stone on the right to add it. Tap a stone in the table, then another one, to draw an arrow between them (again to remove it). Tap a stone twice to write a note. | Коснитесь камня справа, чтобы добавить его. Коснитесь камня в таблице, затем другого — между ними появится стрелка (ещё раз — уберёт её). Дважды коснитесь камня, чтобы написать заметку. |
| {name} selected | Выбран: {name} |
| Note | Заметка |
| Remove stone | Убрать камень |
| Legal scheme | Схема допустима |
| Illegal | Недопустимо |
| Type the runes of the spell one after another, left to right. | Набирайте руны заклинания одну за другой, слева направо. |
| Save changes | Сохранить изменения |
| Save to Spell Drafts | Сохранить в черновики |
| An illegal scheme is still saved as a draft, marked Illegal, but it cannot be crafted. | Недопустимая схема всё равно сохраняется как черновик с пометкой «Недопустимо», но создать по ней заклинание нельзя. |
| Note on {name} | Заметка о камне: {name} |
| Crafted {name}. | Создано: {name}. |
| Search | Поиск |
| Search names and descriptions | Поиск по названиям и описаниям |
| Stones used | Использованные камни |
| No draft matches. | Подходящих черновиков нет. |
| No drafts yet. | Черновиков пока нет. |
| Craft | Создать |
| Delete draft | Удалить черновик |
| Craft {name} | Создать: {name} |
| This scheme is illegal, so it cannot be crafted. | Эта схема недопустима, поэтому заклинание создать нельзя. |
| {name}: needs {need}, you have {have} | {name}: нужно {need}, у вас {have} |
| Notes | Заметки |
| Crafting spends these stones and makes a Magic roll in the chat (only for the GM to see how skilled you are). | Создание тратит эти камни и делает бросок Магии в чате (только чтобы ГМ увидел ваше мастерство). |
| No spells yet. Craft one from a draft. | Заклинаний пока нет. Создайте одно из черновика. |
| Spell tattoo | Татуировка-заклинание |
| Destroyed | Уничтожено |
| No uses | Без использований |
| Uses {cur}/{max} | Использования {cur}/{max} |
| Stabilization {n} | Стабилизация {n} |
| Weapon | Оружие |
| Enhancement | Усиление |
| Chosen as weapon | Выбрано как оружие |
| Use as weapon | Использовать как оружие |
| Add to attack | Добавить к атаке |
| Grant a spell | Выдать заклинание |
| Delete spell | Удалить заклинание |
| Edit spell | Изменить заклинание |
| Grant | Выдать |
| Icon | Значок |
| Set by the GM | Задаёт ГМ |
| Spell tattoo (no uses; durability is a Strength Save) | Татуировка-заклинание (без использований; прочность — спасбросок Силы) |
| Uses left | Осталось использований |
| Max uses | Макс. использований |
| Stabilization | Стабилизация |
| Manifest | Проявление |
| No Tarot Cards yet. | Карт Таро пока нет. |
| Transfer | Передать |
| Swap Card | Сменить карту |
| Add Tarot Card | Добавить карту Таро |
| Choose the card that becomes active. | Выберите карту, которая станет активной. |
| Delete Tarot Card | Удалить карту Таро |
| Edit Tarot Card | Изменить карту Таро |
| Add | Добавить |
| Effect | Эффект |
| Transfer {name} | Передать: {name} |
| Nobody to send it to. | Некому отправить. |
| Send to | Отправить кому |
| No Manifestations yet. | Проявлений пока нет. |
| Add Manifestation | Добавить Проявление |
| Delete Manifestation | Удалить Проявление |
| Edit Manifestation | Изменить Проявление |
| No runes yet. Open a category and tap a rune to add it. | Рун пока нет. Откройте категорию и нажмите на руну, чтобы добавить её. |
| Backspace | Стереть последнюю |
| Remove selected | Убрать выбранную |
| Clear the runes | Очистить руны |
| Remove every rune from the chain? | Убрать все руны из цепочки? |
| Bases | Сборы |
| Modifiers and Links | Модификаторы и связи |
| Release | Форма |
| Spell scheme | Схема заклинания |
| Weapon attack (Prime + Experience) | Атака оружием (Главная + Опыт) |
| Cancelled. | Отменено. |
| Roll | Бросок |
| Give | Передать |
| Goes to the {n} selected targets. | Достаётся всем выбранным целям: {n}. |
| Nobody is selected: it is for the acting character. | Никто не выбран: действие для самого персонажа. |
| Damage | Урон |
| Damage value | Значение урона |
| Help Die | Кубик помощи |
| Status | Статус |
| Stacks | Накопления |
| Temp HP | Врем. ОЗ |
| Temp HP value | Значение врем. ОЗ |
| On the user | На пользователя |
| On the targets | На цели |
| No Effects exist yet. Make some in the Effects section of the General tab. | Эффектов пока нет. Создайте их в разделе «Эффекты» вкладки «Общее». |
| Against | Против |
| Defence it is rolled against | Защита, против которой бросок |
| vs Physical Defence | против физической защиты |
| vs Mental Defence | против ментальной защиты |
| Loading... | Загрузка... |
| Variations: {n} | Вариаций: {n} |
| Edit vibe | Изменить описание знака |
| You have not seen this Stance yet. | Вы ещё не видели эту Стойку. |
| Stance tree | Дерево Стоек |
| Learned | Изучена |
| Known, not learned | Известна, не изучена |
| Known by characters | Известна персонажам |
| Hidden from players | Скрыта от игроков |
| Cost: {list} | Цена: {list} |
| Chosen for the attack | Выбрана для атаки |
| Use in attack | Использовать в атаке |
| Add variation | Добавить вариацию |
| Delete Stance | Удалить Стойку |
| Delete {name} and every variation hanging from it? This cannot be undone. | Удалить «{name}» и все вариации, зависящие от неё? Это нельзя отменить. |
| (missing Effect) | (эффект удалён) |
| Stance roll | Бросок Стойки |
| No effect | Без эффекта |
| Vibe of {name} | Описание знака: {name} |
| Vibe | Описание |
| Empty brings back the default text. | Пустое поле возвращает стандартный текст. |
| Edit Stance | Изменить Стойку |
| New variation of {name} | Новая вариация: {name} |
| Colour of the circle | Цвет круга |
| Character-Known (characters have seen it and can read it) | Известна персонажам (они видели её и могут читать) |
| Learned by (can use it in attacks) | Изучили (могут использовать в атаках) |
| Nobody found. | Никого не найдено. |
| This Stance's Cost is paid with the attack, like an Enhancement's (not for the whole Zodiac). | Цена этой стойки оплачивается вместе с атакой, как цена усиления (задаётся для каждой стойки, а не для всего знака зодиака). |
| What each Stance roll does | Что делает каждый бросок Стойки |
| Same as the band above (-) | Как в диапазоне выше (-) |
| Roll bonus | Бонус к броску |
| Range | Дальность |
| Adds these statuses to targets that are hit | Накладывает эти статусы на поражённые цели |
| Dice Roll Bonuses | Бонусы кубиков |
| Unique Effects | Уникальные эффекты |
| Effects it puts on (whether or not it hits) | Накладываемые эффекты (независимо от попадания) |
| Remove die | Убрать кость |
| Add or subtract | Прибавить или вычесть |
| Die size | Размер кости |
| Add die | Добавить кость |
| Effect name | Название эффекта |
| What it does (shown in the chat) | Что он делает (показывается в чате) |
| Remove effect | Убрать эффект |
| Add Unique Effect | Добавить уникальный эффект |
| Attacks | Атакует |
| Range in Spaces (empty for no range check) | Дальность в клетках (пусто — без проверки дальности) |
| Cost | Цена |
| AP | ОД |
| You take damage | Вы получаете урон |
| Damage taken | Получаемый урон |
| You gain these statuses | Вы получаете эти статусы |
| It spends uses of an item | Тратит использования предмета |
| Item | Предмет |
| Uses spent | Потрачено использований |
| Repeatable (can be used several times in one attack) | Повторяемое (можно использовать несколько раз за атаку) |
| Damage is added to the weapon's damage of its own type. Advantage counts levels (negative is Disadvantage). | Урон добавляется к урону оружия его собственного типа. Преимущество считается в уровнях (отрицательное — помеха). |
| Edit Enhancement | Изменить усиление |
| {base} {kind}, {defence}, {ap} AP | {base} ({kind}), {defence}, {ap} ОД |
| Range {n} | Дальность {n} |
| {n} {kind} damage to you | {n} урона ({kind}) вам |
| {n} uses of {item} | {n} исп. предмета {item} |
| Damage {n} | Урон {n} |
| Effect: {list} | Эффект: {list} |
| Roll {n} | Бросок {n} |
| {effect} ({to}) | {effect} ({to}) |
| Effects | Эффекты |
| No Effects running. | Действующих эффектов нет. |
| {n} rounds left | осталось раундов: {n} |
| Edit Basic Action | Изменить базовое действие |
| New Basic Action | Новое базовое действие |
| No roll | Без броска |
| An Attribute | Характеристика |
| A Skill | Навык |
| A Combat Mastery | Боевое мастерство |
| Which one | Какой именно |
| Effects it puts on | Накладываемые эффекты |
| Statuses it puts on the user | Состояния, накладываемые на пользователя |
| Statuses it puts on the selected targets | Состояния, накладываемые на выбранные цели |
| Gives a Help Die to the selected targets | Даёт выбранным целям кубик помощи |
| Help Die d{n} | Кубик помощи d{n} |
| Basic Actions | Базовые действия |
| The Basic Actions every character has (from DC20). Edit them, delete them or add your own. | Базовые действия, доступные каждому персонажу (из DC20). Меняйте их, удаляйте или добавляйте свои. |
| Use | Использовать |
| Delete Basic Action | Удалить базовое действие |
| Remove part | Убрать часть |
| Which rolls | Какие броски |
| Changes the attack rolls made AGAINST the one who has the Effect. | Меняет броски атаки, сделанные ПРОТИВ того, у кого есть эффект. |
| Kind | Вид |
| Flat (X) | Постоянное (X) |
| Half | Половина |
| Double | Двойной |
| Immunity | Иммунитет |
| Statuses put on when it starts (they last as the Effect does) | Состояния, накладываемые в начале (длятся столько же, сколько эффект) |
| A note for the table (not automated) | Заметка для стола (не автоматизируется) |
| Edit Effect | Изменить эффект |
| New Effect | Новый эффект |
| How long it lasts | Сколько длится |
| It ends after a number of attacks (Uses) | Заканчивается после нескольких атак (использования) |
| Uses | Использования |
| Icon on the token | Значок на фишке |
| What it does | Что делает |
| Part to add | Какую часть добавить |
| Add part | Добавить часть |
| Remove | Убрать |
| Add Effect | Добавить эффект |
| Effects for everyone | Эффекты для всех |
| Effects are modifiers a character has for a while. Put one on this character here; Basic Actions, Enhancements, Stances and weapons can put them on too. | Эффекты — это модификаторы, действующие на персонажа какое-то время. Наложите эффект на этого персонажа здесь; базовые действия, усиления, стойки и оружие тоже могут накладывать их. |
| These are available to every PC and NPC. To make one for a single character, open its own Arcane tab. | Они доступны каждому ПИ и НИ. Чтобы создать эффект для одного персонажа, откройте его вкладку «Тайное». |
| Put on | Наложить |
| Delete Effect | Удалить эффект |
| {stat} (Attribute) | {stat} (характеристика) |
| {save} Save | Спасбросок: {save} |
| {stat} Save | Спасбросок: {stat} |
| {mastery} (Combat Mastery) | {mastery} (боевое мастерство) |
| {scope}: {what} | {scope}: {what} |
| Attacks against: {what} | Атаки против: {what} |
| Physical Defence {n} | Физическая защита {n} |
| Mental Defence {n} | Ментальная защита {n} |
| Movement {n} | Движение {n} |
| Max AP {n} | Макс. ОД {n} |
| Max HP {n} | Макс. ОЗ {n} |
| Damage dealt {n} | Наносимый урон {n} |
| Damage taken {n} | Получаемый урон {n} |
| Critical Hit on {n} | Критическое попадание на {n} |
| Save DC {n} | Сложность спасбросков {n} |
| Resistance ({n}) to {kind} | Сопротивление ({n}): {kind} |
| Resistance (Half) to {kind} | Сопротивление (половина): {kind} |
| Resistance (Double) to {kind} | Сопротивление (двойной): {kind} |
| Immunity to {kind} | Иммунитет: {kind} |
| Starts with {status} | В начале накладывает {status} |
| Starts with {n} Temp HP | В начале даёт {n} врем. ОЗ |
| {n} uses | использований: {n} |
| Circle | Круг |
| Cone | Конус |
| Arc | Дуга |
| Line | Линия |
| Square | Квадрат |
| That file is not an image this browser can read. | Этот файл не является изображением, которое может прочитать браузер. |
| Choose an image file. | Выберите файл изображения. |
| That image is too large even after resizing. Try a smaller one. | Изображение слишком большое даже после уменьшения. Попробуйте меньшее. |

## Characters and roster (GM)

| English | Russian |
| --- | --- |
| New character | Новый персонаж |
| Create | Создать |
| Type | Тип |
| Folder | Папка |
| New folder | Новая папка |
| Inside | Внутри |
| Rename folder | Переименовать папку |
| Rename character | Переименовать персонажа |
| Rename | Переименовать |
| Move {name} | Переместить: {name} |
| Move | Переместить |
| Move to | Переместить в |
| Delete character | Удалить персонажа |
| Delete forever | Удалить навсегда |
| This permanently deletes {name} and cannot be undone. Type the name to confirm. | Это навсегда удалит персонажа {name} без возможности восстановления. Введите имя для подтверждения. |
| Type the name to confirm | Введите имя для подтверждения |
| Delete folder | Удалить папку |
| Delete the folder {name}? Only empty folders can be deleted. | Удалить папку {name}? Можно удалить только пустые папки. |
| Open sheet | Открыть лист |
| Loading roster... | Загрузка списка... |
| Add character | Добавить персонажа |
| Add subfolder | Добавить подпапку |
| Nothing here yet. Create your first character. | Здесь пока пусто. Создайте первого персонажа. |
| Something went wrong. | Что-то пошло не так. |
| (top level) | (верхний уровень) |

## Character sheet

| English | Russian |
| --- | --- |
| Disadvantage | Помеха |
| Attack | Атака |
| Send | Отправить |
| Picture | Картинка |
| Area | Область |
| Pictures | Картинки |
| Battle | Бой |
| AP: {current} of {max} | ОД: {current} из {max} |
| Set AP to {n} | Установить ОД: {n} |
| You cannot move there. | Туда нельзя переместиться. |
| Battle controls | Управление в бою |
| Roll Initiative | Бросить инициативу |
| Initiative {n}. | Инициатива: {n}. |
| Waiting for the GM to begin. | Ждём, когда мастер начнёт бой. |
| Your turn | Ваш ход |
| {name}'s turn | Ход: {name} |
| Someone | Кто-то |
| (round {round}, you are {place} of {total}) | (раунд {round}, вы {place}-й из {total}) |
| (round {round}) | (раунд {round}) |
| End turn | Закончить ход |
| This character is not on the map right now. | Этого персонажа сейчас нет на карте. |
| Movement per AP | Движение за 1 ОД |
| Banked | Накоплено |
| Move {dir} | Шаг: {dir} |
| Free Movement (does not spend Movement or AP) | Свободное перемещение (не тратит движение и ОД) |
| No AP left to attack. | Не осталось ОД для атаки. |
| Select a target below first. | Сначала выберите цель ниже. |
| Spend AP to move? | Потратить ОД на движение? |
| Spend {aps} AP for {movement} Movement? | Потратить ОД ({aps}) ради движения ({movement})? |
| Yes | Да |
| Height (Spaces in the air, shown above the token) | Высота (клеток над землёй, показывается над фишкой) |
| Consumption | Поглощение |
| Resistance ({n}) | Сопротивление ({n}) |
| Resistance (Half) | Сопротивление (половина) |
| Resistance (Double) | Сопротивление (двойной) |
| Resistance | Сопротивление |
| Resistance (X): positive takes less damage, negative takes more | Сопротивление (X): положительное — урона меньше, отрицательное — больше |
| Resistance value | Значение сопротивления |
| Half (x0.5) | Половина (x0.5) |
| Double (x2) | Двойной (x2) |
| Immunity: takes 0 damage | Иммунитет: урон 0 |
| Consumption: takes 0 and heals half of the raw damage | Поглощение: урон 0 и лечение на половину исходного урона |
| Flat (X) modifiers apply first, then Half or Double. Clear everything to remove the row. | Сначала применяется число (X), затем половина или двойной. Снимите всё, чтобы убрать строку. |
| Remove this row | Убрать эту строку |
| Resistances | Сопротивления |
| No resistances. | Сопротивлений нет. |
| Add or edit resistance | Добавить или изменить сопротивление |
| Add status | Добавить состояние |
| DC of the Repeated Save | Сл повторяющегося спасброска |
| A status added by hand needs no Save. | Статус, добавленный вручную, не требует спасброска. |
| No matching statuses. | Подходящих состояний нет. |
| Statuses | Состояния |
| No statuses. | Состояний нет. |
| Decrease {name} | Уменьшить: {name} |
| Increase {name} | Увеличить: {name} |
| DC {n} | Сл {n} |
| Toggle full text of {name} | Показать или скрыть полный текст: {name} |
| Edit feature | Изменить особенность |
| New feature | Новая особенность |
| Delete feature | Удалить особенность |
| Features | Особенности |
| Add feature | Добавить особенность |
| Edit item | Изменить предмет |
| New item | Новый предмет |
| Max uses (1 to {max}) | Максимум использований (от 1 до {max}) |
| Weapon (shown in the Arcane tab) | Оружие (показывается во вкладке Аркана) |
| Effects it puts on its user when used | Эффекты, которые предмет накладывает на владельца при использовании |
| State options | Варианты состояния |
| New state | Новое состояние |
| Give {name} | Передать: {name} |
| Offer {name} | Предложить: {name} |
| Send offer | Отправить предложение |
| The other player must accept before the item moves. | Другой игрок должен принять предмет, прежде чем он перейдёт. |
| (empty) | (пусто) |
| {name} uses | Использования: {name} |
| State | Состояние |
| (none) | (нет) |
| Copy | Копировать |
| Delete item | Удалить предмет |
| Inventory | Инвентарь |
| Add item | Добавить предмет |
| With Effects: {n} | С эффектами: {n} |
| Could not load the sheet. | Не удалось загрузить лист. |
| That change was not saved. | Изменение не сохранено. |
| The roll failed. | Бросок не удался. |
| Loading sheet... | Загрузка листа... |
| Back to roster | Назад к списку |
| View | Вид |
| Vitals | Показатели |
| Action Points | Очки действий |
| Minion | Приспешник |
| Hit Points | Очки здоровья |
| Current HP | Текущие ОЗ |
| Max HP | Макс. ОЗ |
| Temp HP: takes damage before HP. It does not stack. | Врем. ОЗ принимают урон раньше ОЗ и не суммируются. |
| Physical Defence | Физическая защита |
| Mental Defence | Ментальная защита |
| Movement (squares per AP) | Движение (клеток за ОД) |
| Movement | Движение |
| Size (token) | Размер (фишка) |
| Size | Размер |
| Experience Modifier | Модификатор опыта |
| Stats | Характеристики |
| On a phone, tapping opens the roll options. With a mouse, click rolls at once and right-click opens the options. Statuses apply automatically. | На телефоне нажатие открывает параметры броска. С мышью щелчок бросает сразу, а правый щелчок открывает параметры. Состояния применяются автоматически. |
| {name} value | Значение: {name} |
| Defence | Защита |
| Combat Masteries | Боевые мастерства |
| Tap a name to roll: d20 + the Mastery + your Experience Modifier. | Нажмите на название, чтобы бросить: d20 + мастерство + ваш модификатор опыта. |
| Skills | Навыки |
| + Mastery {tier} | + мастерство {tier} |
| {name} Mastery tier | Уровень мастерства: {name} |
| Stage | Сцена |
| No scene is active right now. | Сейчас нет активной сцены. |
| Scene: {name} | Сцена: {name} |
| Leave the stage | Уйти со сцены |
| Add a picture below first. | Сначала добавьте картинку ниже. |
| Join the stage | Выйти на сцену |
| Choose a picture | Выберите картинку |
| Targeting: Individual or Area | Выбор целей: по одному или областью |
| Individual | По одному |
| Targets (tap again to deselect) | Цели (нажмите ещё раз, чтобы снять выбор) |
| Nobody else is on the map. | На карте больше никого нет. |
| Areas (picking one targets everyone inside it) | Области (выбор области выбирает всех внутри неё) |
| There are no areas on the map. Draw one with the Area tool. | На карте нет областей. Нарисуйте её инструментом «Область». |
| Nobody inside | Внутри никого |
| Clear targets | Снять все цели |
| Normal | Обычный |
| Roll: {title} | Бросок: {title} |
| {n}d20, keep the {which}: {mode} ({sources}) | {n}d20, берём {which}: {mode} ({sources}) |
| highest | наибольший |
| lowest | наименьший |
| Extra Advantage levels (negative for Disadvantage) | Дополнительные уровни преимущества (отрицательные — помеха) |
| Use a whole number from -99 to 99. | Введите целое число от -99 до 99. |

## Chat and rolls

| English | Russian |
| --- | --- |
| Attack Value | Значение атаки |
| Target Value | Значение цели |
| Critical | Критический |
| Critical Failure | Критический провал |
| Start of turn | Начало хода |
| Spell crafting | Создание заклинания |
| Replaced | Заменено |
| Reverted | Отменено |
| Revert | Отменить |
| vs | против |
| Chat | Чат |
| No messages yet. Rolls show up here. | Сообщений пока нет. Здесь появляются броски. |
| Message | Сообщение |
| Clear chat | Очистить чат |
| Delete every message for everyone? This cannot be undone. | Удалить все сообщения у всех? Это нельзя отменить. |

## Attacks

| English | Russian |
| --- | --- |
| Attacks waiting: {n} | Атак ожидает: {n} |
| {name} attacks with {weapon} | {name} атакует: {weapon} |
| Rolled {total} (natural {natural}) against {label} | Выпало {total} (на кубике {natural}) против: {label} |
| Enhancements: {list} | Усиления: {list} |
| Also gives every target: {list} | Также даёт каждой цели: {list} |
| a d{sides} Help Die | кубик помощи d{sides} |
| {n} Temp HP | {n} врем. ОЗ |
| Stance {name}: rolled {total}, band {band} | Стойка «{name}»: выпало {total}, диапазон {band} |
| Effects: {list} | Эффекты: {list} |
| Advantage (+) or Disadvantage (-) | Преимущество (+) или помеха (-) |
| Advantage levels | Уровни преимущества |
| Roll with Disadvantage | Бросить с помехой |
| Roll with Advantage | Бросить с преимуществом |
| Dice: {list} | Кубики: {list} |
| Total | Итог |
| Attack total | Итог атаки |
| no sheet | нет листа |
| heals {n} | лечит на {n} |
| {n} damage | урон {n} |
| Temp HP absorbs {n}. | Врем. ОЗ поглощают {n}. |
| HP {from} to {to} | ОЗ {from} → {to} |
| None of the targets is on the map any more. | Ни одной из целей больше нет на карте. |
| Discard | Отклонить |
| Apply | Применить |

## Battle map and combat

| English | Russian |
| --- | --- |
| Token Settings: {name} | Настройки фишки: {name} |
| Size: {n} x {n} squares (set on the character sheet or the temp NPC). | Размер: {n} x {n} клеток (задаётся в листе персонажа или у временного НПС). |
| Banked Movement: {n}. | Накопленное движение: {n}. |
| Remove from the map | Убрать с карты |
| Clear banked Movement | Сбросить накопленное движение |
| Less | Меньше |
| Grid | Сетка |
| {cols} x {rows} squares. Line the grid up with the map. Sizes are in pixels of the map picture; Ctrl + mouse wheel changes the square size by 1. The grid may reach past the picture, only its lines over the picture are shown. | Клеток: {cols} x {rows}. Совместите сетку с картой. Размеры в пикселях картинки карты; Ctrl + колесо мыши меняет размер клетки на 1. Сетка может выходить за картинку, но показываются только её линии над картинкой. |
| Square size (px) | Размер клетки (пикс.) |
| Shift right (px) | Сдвиг вправо (пикс.) |
| Shift down (px) | Сдвиг вниз (пикс.) |
| Height: {name} | Высота: {name} |
| +{n} sp. | +{n} кл. |
| No scene is active. Open Scenes to start one. | Нет активной сцены. Откройте «Сцены», чтобы запустить одну. |
| Waiting for the GM to start a scene. | Ждём, когда мастер запустит сцену. |
| This scene has no battle map yet. Open Scenes, choose the scene and add a Battle map. | У этой сцены пока нет боевой карты. Откройте «Сцены», выберите сцену и добавьте боевую карту. |
| The GM has not set up a battle map for this scene yet. | Мастер ещё не настроил боевую карту для этой сцены. |
| {n} squares | клеток: {n} |
| Zoom out | Отдалить |
| Zoom in | Приблизить |
| Draw | Рисовать |
| Ping | Метка |
| Ruler | Линейка |
| Erase | Стереть |
| Grid on | Сетка: вкл. |
| Grid off | Сетка: выкл. |
| Set grid | Настроить сетку |
| Drawing mode | Режим рисования |
| Pen | Перо |
| Eraser | Ластик |
| Colour {c} | Цвет {c} |
| Eraser size | Размер ластика |
| Line width | Толщина линии |
| Drag over a drawing to rub it out. | Проведите по рисунку, чтобы стереть его часть. |
| Press and drag to draw. | Нажмите и ведите, чтобы рисовать. |
| Clean | Очистить всё |
| Shape | Форма |
| Squares | Клеток |
| Template size | Размер области |
| More squares | Больше клеток |
| Fewer squares | Меньше клеток |
| Drag an area to move it. With an area selected, Ctrl + mouse wheel turns it by 1 degree and Shift + mouse wheel by 15. | Перетащите область, чтобы переместить её. Для выбранной области Ctrl + колесо мыши поворачивает её на 1 градус, Shift + колесо на 15. |
| Press for the start, drag for the direction. | Нажмите для начала, потяните для направления. |
| Click a drawing or an area to remove it. | Щёлкните по рисунку или области, чтобы убрать их. |
| Token Settings | Настройки фишки |
| Reveal | Показать |
| Hide | Скрыть |
| Set Height | Высота |
| Start combat | Начать бой |
| Round {n} | Раунд {n} |
| Rolling Initiative | Бросок инициативы |
| Edit initiative of {name} | Изменить инициативу: {name} |
| Move {name} up | Поднять выше: {name} |
| Move {name} down | Опустить ниже: {name} |
| Remove {name} from combat | Убрать из боя: {name} |
| Add to combat | Добавить в бой |
| Add to combat... | Добавить в бой... |
| Roll for NPCs | Бросок за НПС |
| Begin combat | Начать раунды |
| Next turn | Следующий ход |
| End combat | Закончить бой |
| Cancel combat | Отменить бой |
| Lower by one Space | Ниже на одну клетку |
| Down | Вниз |
| Spaces | Клеток |
| Raise by one Space | Выше на одну клетку |
| Up | Вверх |
| Reset | Сбросить |

## Scenes, stage and library

| English | Russian |
| --- | --- |
| Add here | Добавить сюда |
| Subfolder | Подпапка |
| Upload failed. | Не удалось загрузить. |
| No pictures yet. Add one to use this character on a scene. | Картинок пока нет. Добавьте одну, чтобы вывести персонажа на сцену. |
| Untitled | Без названия |
| Delete {name} | Удалить: {name} |
| picture | картинку |
| Uploading... | Загрузка... |
| Add pictures | Добавить картинки |
| Rename picture | Переименовать картинку |
| New scene | Новая сцена |
| Background: {name} | Фон: {name} |
| Choose a background picture | Выберите фоновую картинку |
| Rename scene | Переименовать сцену |
| Replace | Заменить |
| Choose a new background picture | Выберите новую фоновую картинку |
| Battle map: {name} | Боевая карта: {name} |
| Upload | Загрузить |
| Choose the battle map picture | Выберите картинку боевой карты |
| After uploading, switch to Battle and use Set grid to line the squares up with the map. | После загрузки переключитесь на «Бой» и настройте сетку, чтобы клетки совпали с картой. |
| Scenes | Сцены |
| No scenes yet. | Сцен пока нет. |
| Active | Активна |
| Deactivate | Выключить |
| Activate | Включить |
| Background | Фон |
| Battle map (set) | Боевая карта (есть) |
| Battle map | Боевая карта |
| Delete scene | Удалить сцену |
| Delete {name} and everyone standing on it? This cannot be undone. | Удалить сцену {name} и всех, кто на ней стоит? Это нельзя отменить. |
| New temp NPC | Новый временный НПС |
| A quick, sheet-less extra for the story. It only needs a name and a picture. | Быстрый статист для сюжета без листа. Нужны только имя и картинка. |
| A prop or terrain (a crate, a tree, a wall) rather than a creature | Предмет или местность (ящик, дерево, стена), а не существо |
| Token size on the battle map | Размер фишки на боевой карте |
| Picture: {name} | Картинка: {name} |
| Choose a first picture (optional) | Выберите первую картинку (по желанию) |
| hidden | скрыт |
| on map | на карте |
| on stage | на сцене |
| Remove token | Убрать фишку |
| Place token | Поставить фишку |
| Summon | Вызвать |
| Reset spot | Сбросить место |
| {n} characters | Персонажей: {n} |
| Cast | Актёры |
| No characters. | Персонажей нет. |
| Pictures: {name} | Картинки: {name} |
| Temp NPCs | Временные НПС |
| No temp NPCs yet. | Временных НПС пока нет. |
| PROP | ОБЪЕКТ |
| TEMP | ВРЕМ. |
| Token size of {name} | Размер фишки: {name} |
| Delete temp NPC | Удалить временного НПС |
| Delete {name} and its pictures? This cannot be undone. | Удалить {name} и его картинки? Это нельзя отменить. |
| Rename temp NPC | Переименовать временного НПС |
| Size: {n} | Размер: {n} |
| Remove from stage | Убрать со сцены |
| Reset position | Сбросить положение |
| No scene | Нет сцены |
| Mode | Режим |

## Music

| English | Russian |
| --- | --- |
| Music | Музыка |
| Click for sound | Нажмите для звука |
| Volume: {n}% | Громкость: {n}% |
| Mute on this screen | Выключить звук на этом экране |
| Repeat: off | Повтор: выкл. |
| Repeat: one | Повтор: один трек |
| Repeat: playlist | Повтор: плейлист |
| Nothing playing | Ничего не играет |
| Position | Позиция |
| Previous | Предыдущий |
| Pause | Пауза |
| Play | Играть |
| Next | Следующий |
| Stop | Стоп |
| Shuffle: on | Перемешать: вкл. |
| Shuffle: off | Перемешать: выкл. |
| Add a track to {name} | Добавить трек в плейлист: {name} |
| YouTube link | Ссылка на YouTube |
| Name (filled in from YouTube when possible) | Название (подставляется из YouTube, если возможно) |
| Add a YouTube track | Добавить трек с YouTube |
| Rename playlist | Переименовать плейлист |
| Rename track | Переименовать трек |
| Delete playlist | Удалить плейлист |
| Delete {name} and its {n} tracks? If it is playing, the music stops. | Удалить плейлист {name} и его треки ({n})? Если он играет, музыка остановится. |
| Delete track | Удалить трек |
| Delete {name}? | Удалить: {name}? |
| "{name}" cannot be played (YouTube does not allow it). Skipped. | Трек «{name}» нельзя воспроизвести (YouTube не разрешает). Пропущен. |
| The YouTube player could not be loaded on this screen, so nothing can be heard here. Check the connection. | Плеер YouTube не удалось загрузить на этом экране, поэтому здесь ничего не слышно. Проверьте соединение. |
| New playlist | Новый плейлист |
| No playlists yet. | Плейлистов пока нет. |

## Game terms (stats, skills, statuses, damage types)

| English | Russian |
| --- | --- |
| Weapon Attack Roll | Бросок атаки оружием |
| Fire | Огонь |
| Strength | Сила |
| Strength Attribute Roll | Проверка атрибута: Сила |
| Strength Save | Спасбросок: Сила |
| Strength Defence | Защита: Сила |
| Prime: Strength | Главный: Сила |
| Dexterity | Ловкость |
| Dexterity Attribute Roll | Проверка атрибута: Ловкость |
| Dexterity Save | Спасбросок: Ловкость |
| Dexterity Defence | Защита: Ловкость |
| Prime: Dexterity | Главный: Ловкость |
| Intelligence | Интеллект |
| Intelligence Attribute Roll | Проверка атрибута: Интеллект |
| Intelligence Save | Спасбросок: Интеллект |
| Intelligence Defence | Защита: Интеллект |
| Prime: Intelligence | Главный: Интеллект |
| Spirit | Дух |
| Spirit Attribute Roll | Проверка атрибута: Дух |
| Spirit Save | Спасбросок: Дух |
| Spirit Defence | Защита: Дух |
| Prime: Spirit | Главный: Дух |
| Luck | Удача |
| Luck Attribute Roll | Проверка атрибута: Удача |
| Luck Save | Спасбросок: Удача |
| Luck Defence | Защита: Удача |
| Prime: Luck | Главный: Удача |
| Physical | Физическая |
| Physical Save | Физический спасбросок |
| Mental | Ментальная |
| Mental Save | Ментальный спасбросок |
| Mastery: Magic | Мастерство: Магия |
| Magic (Combat Mastery Roll) | Магия (проверка боевого мастерства) |
| Magic attack | Атака: Магия |
| Stances | Стойки |
| Mastery: Stances | Мастерство: Стойки |
| Stances (Combat Mastery Roll) | Стойки (проверка боевого мастерства) |
| Stances attack | Атака: Стойки |
| Mastery: Manifest | Мастерство: Проявление |
| Manifest (Combat Mastery Roll) | Проявление (проверка боевого мастерства) |
| Manifest attack | Атака: Проявление |
| Awareness | Внимательность |
| Mastery: Awareness | Мастерство: Внимательность |
| Awareness (Skill Roll) | Внимательность (проверка навыка) |
| Weight Manipulation | Управление весом |
| Mastery: Weight Manipulation | Мастерство: Управление весом |
| Weight Manipulation (Skill Roll) | Управление весом (проверка навыка) |
| Stamina | Выносливость |
| Mastery: Stamina | Мастерство: Выносливость |
| Stamina (Skill Roll) | Выносливость (проверка навыка) |
| Speed | Скорость |
| Mastery: Speed | Мастерство: Скорость |
| Speed (Skill Roll) | Скорость (проверка навыка) |
| Fine Motor Skills | Мелкая моторика |
| Mastery: Fine Motor Skills | Мастерство: Мелкая моторика |
| Fine Motor Skills (Skill Roll) | Мелкая моторика (проверка навыка) |
| Mental Resolve | Ментальная стойкость |
| Mastery: Mental Resolve | Мастерство: Ментальная стойкость |
| Mental Resolve (Skill Roll) | Ментальная стойкость (проверка навыка) |
| Soul Control | Контроль души |
| Mastery: Soul Control | Мастерство: Контроль души |
| Soul Control (Skill Roll) | Контроль души (проверка навыка) |
| Astrology | Астрология |
| Mastery: Astrology | Мастерство: Астрология |
| Astrology (Skill Roll) | Астрология (проверка навыка) |
| Symbolism | Символизм |
| Mastery: Symbolism | Мастерство: Символизм |
| Symbolism (Skill Roll) | Символизм (проверка навыка) |
| Body Movement | Движение тела |
| Mastery: Body Movement | Мастерство: Движение тела |
| Body Movement (Skill Roll) | Движение тела (проверка навыка) |
| Likability | Обаяние |
| Mastery: Likability | Мастерство: Обаяние |
| Likability (Skill Roll) | Обаяние (проверка навыка) |
| Cold | Холод |
| Acid | Кислота |
| Poison | Яд |
| Lightning | Молния |
| Sound | Звук |
| Bludgeoning | Дробящий |
| Slashing | Рубящий |
| Piercing | Колющий |
| Soul | Душа |
| Decay | Распад |
| Psychic | Психический |
| Miss | Промах |
| Hit | Попадание |
| Heavy Hit | Сильное попадание |
| Brutal Hit | Жестокое попадание |
| Blood Oxidization | Окисление крови |
| The blood becomes much more acidic (from a failed Strength Save against a Spell tattoo). Not automated. | Кровь становится гораздо более кислотной (из-за проваленного спасброска Силы против татуировки-заклинания). Не автоматизировано. |
| Bleeding | Кровотечение |
| X true damage at turn start. Removed only by healing, or by using a helpful item for 1 AP (wording only; item use is not automated). | X чистого урона в начале хода. Снимается только лечением или полезным предметом за 1 ОД (только формулировка; использование предметов не автоматизировано). |
| Blinded | Ослеплён |
| Cannot see; terrain is difficult unless guided. Auto-fail Awareness (sight). Attacks have Disadvantage; attackers have Advantage. | Не видит; местность труднопроходима без проводника. Проверки внимательности (зрение) автоматически проваливаются. Атаки с помехой; атакующие с преимуществом. |
| Burning | Горение |
| X fire damage at turn start. Ends when doused. A nearby creature can spend 1 AP to remove 1 stack. | X урона огнём в начале хода. Прекращается, если потушить. Существо рядом может потратить 1 ОД, чтобы снять 1 накопление. |
| Charmed | Очарован |
| Charmer has Advantage on Spirit checks against you. You cannot target the charmer with harmful attacks or effects. | Очаровавший имеет преимущество на проверки Духа против вас. Вы не можете выбирать очаровавшего целью вредных атак или эффектов. |
| Dazed | Ошеломлён |
| Disadvantage X on mental checks (Intelligence, Spirit). | Помеха X на ментальные проверки (Интеллект, Дух). |
| Deafened | Оглох |
| Cannot hear. Auto-fail hearing-based Awareness. Flanking melee attackers have Advantage. | Не слышит. Проверки внимательности (слух) автоматически проваливаются. Атакующие в ближнем бою с фланга имеют преимущество. |
| Disoriented | Дезориентирован |
| Disadvantage X on mental saves. | Помеха X на ментальные спасброски. |
| Doomed | Обречён |
| Current and max HP reduced by X. Healing received reduced by X. | Текущие и максимальные ОЗ уменьшены на X. Получаемое лечение уменьшено на X. |
| Exhaustion | Истощение |
| Penalty X on all checks and saves. Speed and Save DC reduced by X. Death at 6 stacks. | Штраф X ко всем проверкам и спасброскам. Скорость и СЛ спасбросков уменьшены на X. Смерть при 6 накоплениях. |
| Exposed | Раскрыт |
| Attacks against you have Advantage X. (Natural 1 gives one stack that ends after the first Attack roll against you.) | Атаки против вас имеют преимущество X. (Натуральная 1 даёт одно накопление, которое исчезает после первого броска атаки против вас.) |
| Frightened | Испуган |
| Cannot willingly move closer to the source. Disadvantage on all checks against the source. | Не может добровольно приближаться к источнику. Помеха на все проверки против источника. |
| Fully Concealed | Полностью скрыт |
| Creatures treat you as Blinded to see you. Attackers have Disadvantage; you have Advantage. Auto-fail Awareness to see you. | Существа видят вас так, будто ослеплены. Атакующие с помехой; вы с преимуществом. Проверки внимательности, чтобы увидеть вас, автоматически проваливаются. |
| Fully Stunned | Полностью оглушён |
| Incapacitated. Attacks against you have Advantage. Auto-fail Physical Saves (except poison/disease). Cannot go below 0 AP. | Недееспособен. Атаки против вас с преимуществом. Физические спасброски автоматически проваливаются (кроме яда и болезней). ОД не опускаются ниже 0. |
| Grappled | Схвачен |
| Immobilized, Disadvantage on Dexterity Saves. Escape with a Body Movement roll against the grappler's Weight Manipulation, 1 AP. | Обездвижен, помеха на спасброски Ловкости. Вырваться можно проверкой движения тела против управления весом схватившего, 1 ОД. |
| Half Cover | Половинное укрытие |
| All Attacks and Spell Checks against you have -2. | Все атаки и проверки заклинаний против вас получают -2. |
| Hidden | Скрыт |
| Unseen and Unheard. Attackers have Disadvantage; you have Advantage on attacks. | Не виден и не слышен. Атакующие с помехой; ваши атаки с преимуществом. |
| Hindered | Затруднён |
| Disadvantage X on attacks. | Помеха X на атаки. |
| Immobilized | Обездвижен |
| Cannot move. Disadvantage on Dexterity Saves. | Не может двигаться. Помеха на спасброски Ловкости. |
| Impaired | Стеснён |
| Disadvantage X on physical checks (Strength, Dexterity). | Помеха X на физические проверки (Сила, Ловкость). |
| Incapacitated | Недееспособен |
| Cannot move or speak. Cannot spend AP or use Minor Actions. Movement 0. | Не может двигаться и говорить. Не может тратить ОД и использовать малые действия. Движение 0. |
| Intimidated | Запуган |
| Disadvantage on all checks against the source. | Помеха на все проверки против источника. |
| Invisible | Невидим |
| Creatures cannot see you unless they perceive invisibility. You have Advantage on attacks; attackers have Disadvantage. | Существа не видят вас, если не воспринимают невидимость. Ваши атаки с преимуществом; атакующие с помехой. |
| Paralyzed | Парализован |
| Incapacitated. Auto-fail Physical Saves. Attacks against you have Advantage. Melee attacks within 1 Space are critical hits. | Недееспособен. Физические спасброски автоматически проваливаются. Атаки против вас с преимуществом. Атаки в ближнем бою с расстояния 1 клетка — критические попадания. |
| Partially Concealed | Частично скрыт |
| Creatures have Disadvantage on Awareness to see you. | У существ помеха на внимательность, чтобы вас увидеть. |
| Petrified | Окаменел |
| Incapacitated, 10x heavier, unaware. Auto-fail Physical Saves. Vulnerable to bludgeoning, resistant to other damage. Other statuses suspended; immune to new ones. | Недееспособен, в 10 раз тяжелее, без сознания. Физические спасброски автоматически проваливаются. Уязвим к дробящему урону, устойчив к прочему. Другие состояния приостановлены; новые не действуют. |
| Prone | Сбит с ног |
| Disadvantage on attacks. Ranged attacks against you have Disadvantage; melee have Advantage. Movement costs +1 per space. Standing costs 2 movement. | Помеха на атаки. Дальние атаки против вас с помехой; ближние — с преимуществом. Движение стоит +1 за клетку. Подъём стоит 2 движения. |
| Restrained | Скован |
| Immobilized, Disadvantage on Dexterity Saves. Attacks by you have Disadvantage; attackers have Advantage. | Обездвижен, помеха на спасброски Ловкости. Ваши атаки с помехой; атакующие с преимуществом. |
| Slowed | Замедлен |
| Each space of movement costs X additional spaces. | Каждая клетка движения стоит на X клеток больше. |
| Stunned | Оглушён |
| Current and max AP reduced by X. At 4 or more: Incapacitated, attacks against you have Advantage, auto-fail Physical Saves. | Текущие и максимальные ОД уменьшены на X. При 4 и более: недееспособен, атаки против вас с преимуществом, физические спасброски автоматически проваливаются. |
| Surprised | Застигнут врасплох |
| Current and max AP reduced by 2. | Текущие и максимальные ОД уменьшены на 2. |
| Taunted | Спровоцирован |
| Disadvantage on attacks against targets other than the source. | Помеха на атаки по целям, кроме источника. |
| Terrified | Охвачен ужасом |
| Must spend turns moving away from the source. Only actions: Move to flee, or Dodge if cornered. | Обязан тратить ходы на бегство от источника. Только действия: бежать или уклоняться, если загнан в угол. |
| Tethered | Привязан |
| Cannot move farther than a set number of spaces from the tether point or creature. | Не может отойти дальше заданного числа клеток от точки или существа привязки. |
| 3/4 Cover | Укрытие 3/4 |
| All Attacks and Spell Checks against you have -5. | Все атаки и проверки заклинаний против вас получают -5. |
| Unconscious | Без сознания |
| Incapacitated and Prone. Unaware. Auto-fail Physical Saves. Attacks against you have Advantage; melee within 1 Space are critical hits. | Недееспособен и сбит с ног. Ничего не осознаёт. Физические спасброски автоматически проваливаются. Атаки против вас с преимуществом; ближние с расстояния 1 клетка — критические попадания. |
| Unheard | Бесшумен |
| Advantage on melee attacks against flanked enemies who cannot hear you. | Преимущество на атаки в ближнем бою по врагам с фланга, которые вас не слышат. |
| Unseen | Незаметен |
| Advantage on your attacks; attackers have Disadvantage. | Преимущество на ваши атаки; у атакующих помеха. |
| Weakened | Ослаблен |
| Disadvantage X on physical saves (Strength, Dexterity). | Помеха X на физические спасброски (Сила, Ловкость). |
| Cancer | Рак |
| Records an emotional phenomenon and feelings. | Записывает эмоциональное явление и чувства. |
| Virgo | Дева |
| Records a physical phenomenon. | Записывает физическое явление. |
| Taurus | Телец |
| Stabilizes the effect by reducing its power by several Spell Levels, but granting additional uses. | Стабилизирует эффект, снижая его силу на несколько уровней заклинания, но давая дополнительные использования. |
| Leo | Лев |
| Creates a positive version of the recorded effect. | Создаёт положительную версию записанного эффекта. |
| Scorpio | Скорпион |
| Makes the effect weaker but longer-lasting. | Делает эффект слабее, но длительнее. |
| Sagittarius | Стрелец |
| Makes the effect weaker but with much greater range. | Делает эффект слабее, но с намного большей дальностью. |
| Pisces | Рыбы |
| The effect envelops the mage and makes them immune to it. | Эффект окутывает мага и делает его невосприимчивым к нему. |
| Libra | Весы |
| Combines two different effects, halving the strength of each. | Объединяет два разных эффекта, вдвое ослабляя каждый. |
| Capricorn | Козерог |
| Slightly weakens the effects but lets one act as a catalyst for the other. | Немного ослабляет эффекты, но позволяет одному стать катализатором для другого. |
| Aries | Овен |
| Aggressive release of the recorded phenomenon. | Агрессивное высвобождение записанного явления. |
| Gemini | Близнецы |
| Stealthy release suited for traps, but it takes time to charge. | Скрытое высвобождение, подходящее для ловушек, но требующее времени на зарядку. |
| Aquarius | Водолей |
| Precise, targeted release that grows stronger the more restrictions are placed on it. | Точечное высвобождение, которое становится сильнее с каждым наложенным ограничением. |
| Base | Сбор |
| Modifier | Модификатор |
| Link | Связь |
| Logic | Логика |
| If | Если |
| Then | То |
| Or | Или |
| And | И |
| Else | Иначе |
| Equal to | Равно |
| Greater than | Больше |
| Less than | Меньше |
| Not | Не |
| Where | Где |
| Properties | Свойства |
| Force / Strength | Сила / Мощь |
| Counteraction | Противодействие |
| Weight | Вес |
| Time | Время |
| Space | Пространство |
| Form / Shape | Форма / Облик |
| Hardness | Твёрдость |
| Pressure | Давление |
| Consciousness | Сознание |
| Temperature | Температура |
| Emotion | Эмоция |
| Control | Контроль |
| Separation | Разделение |
| Positive | Положительное |
| Negative | Отрицательное |
| Increase | Увеличение |
| Decrease | Уменьшение |
| Ignoring | Игнорирование |
| Recognition | Распознавание |
| Unification | Объединение |
| Filling | Наполнение |
| Targeting & Geometry | Цели и геометрия |
| Avoidance | Уклонение |
| Chance | Шанс |
| Radius | Радиус |
| Surround | Окружение |
| Actions | Действия |
| Transform | Преобразовать |
| Find | Найти |
| Enchant | Зачаровать |
| Elements & Essences | Стихии и сущности |
| Earth | Земля |
| Energy | Энергия |
| Life | Жизнь |
| Light | Свет |
| Metal | Металл |
| Water | Вода |
| Air | Воздух |
| Wood / Tree | Дерево |
| Darkness / Void | Тьма / Пустота |
| Death | Смерть |
| Bold and headlong: strike first and think later. | Смелость и напор: бей первым, думай потом. |
| Patient and unshakable: hold the ground and outlast. | Терпение и непоколебимость: стой на месте и переживи всех. |
| Quick and doubled: two moves where others make one. | Быстрота и двойственность: два движения там, где другие делают одно. |
| Protective and tidal: feelings shape the fight. | Защита и приливы: чувства определяют бой. |
| Proud and radiant: fight as if the world is watching. | Гордость и сияние: сражайся так, будто весь мир смотрит. |
| Precise and careful: every motion is measured. | Точность и внимательность: каждое движение выверено. |
| Balanced and poised: answer force with force. | Равновесие и выдержка: отвечай силой на силу. |
| Patient and venomous: wait, then strike deep. | Терпение и яд: жди, а затем бей глубоко. |
| Free and far-reaching: strike from a distance. | Свобода и размах: бей издалека. |
| Disciplined and enduring: a steady climb, no shortcuts. | Дисциплина и стойкость: ровный подъём, без коротких путей. |
| Odd and inventive: break the pattern. | Странность и изобретательность: сломай шаблон. |
| Fluid and elusive: slip away and give way. | Текучесть и неуловимость: ускользай и уступай. |
| Less than 10 | Меньше 10 |
| 10-14 | 10-14 |
| 15-19 | 15-19 |
| 20-24 | 20-24 |
| 25-29 | 25-29 |
| 30 or more | 30 и больше |
| Initiative (Speed) | Инициатива (скорость) |
| NW | СЗ |
| N | С |
| NE | СВ |
| W | З |
| E | В |
| SW | ЮЗ |
| S | Ю |
| SE | ЮВ |
| {a}, {b} | {a}, {b} |
| {a} {b} | {a} {b} |
| {a}; {b} | {a}; {b} |

## Messages from the server (errors and chat lines)

| English | Russian |
| --- | --- |
| Too many Enhancements. | Слишком много усилений. |
| That entry no longer exists. | Этой записи больше нет. |
| {what} must be a whole number from {min} to {max}. | Значение «{what}» должно быть целым числом от {min} до {max}. |
| Choose a damage type. | Выберите тип урона. |
| Unknown status. | Неизвестное состояние. |
| True | Чистый |
| Heals | Лечит |
| HP | ОЗ |
| Takes | Получает |
| Gains | Получает |
| Spends | Тратит |
| AP spent | Потрачено ОД |
| Gains Exposed | Получает «Открыт» |
| {label}: a d{sides} joins the track. | {label}: d{sides} добавляется на шкалу. |
| {label}: a d{sides} in place of a d{old}. | {label}: d{sides} вместо d{old}. |
| {label}: the track is full, the new d{sides} is lost. | {label}: шкала полна, новый d{sides} потерян. |
| {label}: {n}. | {label}: {n}. |
| {label}: already {have}, the new {n} does not stack. | {label}: уже {have}, новые {n} не суммируются. |
| {total} vs {defence} {value}: {result}. | {total} против {defence} {value}: {result}. |
| {label}: {formula} {kind}. | {label}: {formula} {kind}. |
| After resistances: {steps}. | С учётом сопротивлений: {steps}. |
| Set by the GM to {n}. | Мастер установил: {n}. |
| {label} {n}. | {label} {n}. |
| {n} damage. | Урон: {n}. |
| {label} absorbs {n}. | {label} поглощает {n}. |
| {label} {from} to {to}. | {label} {from} → {to}. |
| (temporary NPC: no sheet, apply by hand) | (временный НПС: листа нет, примените вручную) |
| {label} {n} {kind} damage as a cost (HP {from} to {to}). | {label} {n} урона ({kind}) как плату (ОЗ {from} → {to}). |
| {label} {status} as a cost. | {label} {status} как плату. |
| {label} {n} uses of {item}. | {label} {n} исп. предмета {item}. |
| {label} 1 (natural 1). | {label} 1 (натуральная 1). |
| {spell} holds: Stabilization rises to {n}. | {spell} держится: Стабилизация растёт до {n}. |
| {spell} bites {name}: Blood Oxidization {n}. | {spell} жжёт {name}: Окисление крови {n}. |
| {spell} falters and is destroyed. | {spell} даёт сбой и уничтожается. |
| {spell} falters: Stabilization resets to {n} and it loses a use ({left} left). | {spell} даёт сбой: Стабилизация сбрасывается до {n}, теряется одно использование (осталось {left}). |
| {source}: {name}. {text} | {source}: {name}. {text} |
| Combat | Бой |
| Attack roll (set by the GM) | Бросок атаки (задан ГМ) |
| That attack is no longer waiting. | Эта атака больше не ожидает. |
| Select at least one target first. | Сначала выберите хотя бы одну цель. |
| That Stance is not learned by this character. | Эта Стойка не изучена этим персонажем. |
| A Spontaneous Action costs 1 or 2 AP. | Спонтанное действие стоит 1 или 2 ОД. |
| Choose a die from d4 to d12. | Выберите кубик от d4 до d12. |
| Choose at least one effect. | Выберите хотя бы один эффект. |
| Choose Physical or Mental Defence. | Выберите физическую или ментальную защиту. |
| Choose the roll to make. | Выберите бросок. |
| That card cannot be edited. | Эту карточку нельзя изменить. |
| {effect} on {name} is not added to the roll: the targets differ. Use Edit on the card if it should count. | Эффект «{effect}» у цели {name} не учтён в броске: у целей он разный. Если он должен учитываться, используйте «Изменить» на карточке. |
| {name} uses the {stance} Stance: rolled {total}, band {band}. | {name} использует Стойку «{stance}»: выпало {total}, диапазон {band}. |
| {name} uses a Spontaneous Action ({ap} AP). | {name} использует спонтанное действие ({ap} ОД). |
| Invalid track. | Неверный трек. |
| That track no longer exists. | Этого трека больше нет. |
| Invalid playlist. | Неверный плейлист. |
| That playlist no longer exists. | Этого плейлиста больше нет. |
| That is not a YouTube video link. | Это не ссылка на видео YouTube. |
| At most {max} tracks per playlist. | Не более {max} треков в плейлисте. |
| The order must list every track once. | В порядке должен быть каждый трек ровно один раз. |
| Unknown repeat mode. | Неизвестный режим повтора. |
| Shuffle must be on or off. | Перемешивание должно быть включено или выключено. |
| Only the GM and the Display play music. | Музыку воспроизводят только мастер и экран стола. |
| Invalid position. | Неверное положение. |
| Too many Basic Actions. | Слишком много базовых действий. |
| That Basic Action no longer exists. | Этого базового действия больше нет. |
| Not enough AP: this action costs {cost} and you have {have}. | Недостаточно ОД: это действие стоит {cost}, а у вас {have}. |
| {name} uses {action}. | {name} использует: {action}. |
| Invalid token. | Неверная фишка. |
| That token is no longer on the map. | Этой фишки больше нет на карте. |
| There is no active scene. | Нет активной сцены. |
| This scene has no battle map yet. | У этой сцены пока нет боевой карты. |
| Add a picture first. | Сначала добавьте картинку. |
| That picture does not belong to this character. | Эта картинка не принадлежит этому персонажу. |
| Already on the map. | Уже на карте. |
| That is off the map. | Это за пределами карты. |
| Hidden must be true or false. | Значение «скрыт» должно быть «да» или «нет». |
| Height must be from 0 to {max} Spaces. | Высота должна быть от 0 до {max} клеток. |
| This character has no Movement. | У этого персонажа нет движения. |
| Not enough AP left to move. | Не хватает ОД для движения. |
| A step is one square in one of eight directions. | Шаг — одна клетка в одном из восьми направлений. |
| At most {max} drawings and templates. Clear some first. | Не более {max} рисунков и областей. Сначала очистите часть. |
| Invalid mark. | Неверная отметка. |
| That area is not on the map. | Этой области нет на карте. |
| Erase on the map. | Стирайте в пределах карты. |
| Invalid colour. | Неверный цвет. |
| Invalid line width. | Неверная толщина линии. |
| A line needs 2 to 500 points. | В линии должно быть от 2 до 500 точек. |
| Points must lie on the map. | Точки должны лежать на карте. |
| Unknown shape. | Неизвестная форма. |
| Size must be 1 to 60 squares. | Размер должен быть от 1 до 60 клеток. |
| Invalid direction. | Неверное направление. |
| Unknown kind of mark. | Неизвестный вид отметки. |
| Type a message first. | Сначала введите сообщение. |
| Messages can be at most {max} characters. | Сообщение может содержать не более {max} символов. |
| There are no characters on the map to fight. | На карте нет персонажей для боя. |
| That character is not in the combat. | Этого персонажа нет в бою. |
| Initiative must be a whole number. | Инициатива должна быть целым числом. |
| Combat has already begun. | Бой уже начался. |
| Combat has not begun. | Бой ещё не начался. |
| The order must list everyone in the combat exactly once. | В порядке должен быть каждый участник боя ровно один раз. |
| Props cannot fight. | Объекты не могут сражаться. |
| That character is already in the combat. | Этот персонаж уже в бою. |
| Surprised 2 | Застигнут врасплох 2 |
| {effect} ends. | Эффект «{effect}» заканчивается. |
| {name} takes {amount} damage from {source} ({detail}). HP {from} to {to}. | {name} получает урон {amount} от источника: {source} ({detail}). ОЗ {from} → {to}. |
| true damage | чистый урон |
| {name} is healed {n} by {source} ({detail}). HP {from} to {to}. | {name} исцеляется на {n} от источника: {source} ({detail}). ОЗ {from} → {to}. |
| {name} takes no damage from {source} ({detail}). | {name} не получает урона от источника: {source} ({detail}). |
| {name} starts with {ap} AP instead of {max} ({reasons}). | {name} начинает ход с {ap} ОД вместо {max} ({reasons}). |
| That Effect no longer exists. | Этого эффекта больше нет. |
| That Effect is no longer running. | Этот эффект уже не действует. |
| Too many Effects. | Слишком много эффектов. |
| Refreshes | Обновляет |
| Adds | Добавляет |
| {label} {effect} (started again). | {label} {effect} (начат заново). |
| {label} {effect}. | {label} {effect}. |
| {label} {list}. | {label} {list}. |
| {effect} ends (no uses left). | Эффект «{effect}» заканчивается (использования закончились). |
| That card can no longer be reverted. | Эту карточку больше нельзя отменить. |
| That card has already been reverted. | Эта карточка уже отменена. |
| Invalid folder. | Неверная папка. |
| That folder no longer exists. | Этой папки больше нет. |
| A folder cannot be moved inside itself. | Папку нельзя переместить внутрь самой себя. |
| Move or delete what is inside this folder first. | Сначала переместите или удалите содержимое папки. |
| The Display Screen has no chat. | У экрана стола нет чата. |
| Choose who you are first. | Сначала выберите, кто вы. |
| That character no longer exists. | Этого персонажа больше нет. |
| You cannot change that character. | Вы не можете изменять этого персонажа. |
| That character is not available. | Этот персонаж недоступен. |
| Choose a different character. | Выберите другого персонажа. |
| The GM transfers items directly. | Мастер передаёт предметы напрямую. |
| You can only trade with another PC. | Обмениваться можно только с другим игроком. |
| That item no longer exists. | Этого предмета больше нет. |
| That offer is no longer available. | Это предложение больше недоступно. |
| Only the receiving player can answer. | Ответить может только получающий игрок. |
| That is not a valid value for this setting. | Недопустимое значение для этой настройки. |
| This status has no Save, so it cannot be Repeated. | У этого статуса нет спасброска, поэтому он не может быть повторяющимся. |
| A Repeated status needs a DC for its Save. | Повторяющемуся статусу нужна Сл для спасброска. |
| That Save is no longer waiting. | Этот спасбросок больше не ожидается. |
| Those Help Dice are not available. | Эти кубики помощи недоступны. |
| No image was sent. | Изображение не было отправлено. |
| Images can be at most {mb} MB after resizing. | После уменьшения изображение может занимать не более {mb} МБ. |
| Only PNG, JPEG and WebP images are accepted. | Принимаются только изображения PNG, JPEG и WebP. |
| The spell {name} has been used since it was crafted, so crafting cannot be reverted. | Заклинание {name} уже применялось после создания, поэтому создание нельзя отменить. |
| Unknown lock. | Неизвестная блокировка. |
| That part of the Arcane tab is locked. | Эта часть вкладки Аркана заблокирована. |
| A name is required. | Нужно указать имя. |
| Too many cards. | Слишком много карт. |
| Too many Manifestations. | Слишком много Проявлений. |
| Advantage levels must be a whole number from -{max} to {max}. | Уровни преимущества должны быть целым числом от -{max} до {max}. |
| Names can be at most {max} characters. | Имя может содержать не более {max} символов. |
| Invalid id. | Неверный идентификатор. |
| Type must be PC or NPC. | Тип должен быть «Игрок» или «НПС». |
| Type the exact name to confirm deletion. | Введите точное имя для подтверждения удаления. |
| Resisted | Устоял |
| Failed | Провал |
| Ends | Заканчивается |
| {status} ({duration}) | {status} ({duration}) |
| {save} against {status}: {total} vs DC {dc}, {result}. | {save} против {status}: {total} против Сл {dc}, {result}. |
| {status}: {save} against DC {dc}, waiting for {name}. | {status}: {save} против Сл {dc}, ждём {name}. |
| {name}: {status} | {name}: {status} |
| GM only. | Только для мастера. |
| Only the GM or the Display can change a size. | Менять размер могут только мастер и экран стола. |
| The Display Screen cannot summon. | Экран стола не может вызывать персонажей. |
| You can only summon your own character. | Вы можете вызвать только своего персонажа. |
| You can only dismiss your own character. | Вы можете убрать только своего персонажа. |
| Only the GM or the Display can change a figure. | Менять фигуру могут только мастер и экран стола. |
| You can only move your own character. | Вы можете двигать только своего персонажа. |
| Only the GM or the Display can change that. | Это может менять только ГМ или Экран. |
| Only the GM or the Display can remove a token. | Убирать фишку могут только мастер и экран стола. |
| You can only change the height of your own character. | Вы можете менять высоту только своего персонажа. |
| You can only move your own character by dragging. | Перетаскивать можно только своего персонажа. |
| That token is not on the active map. | Этой фишки нет на активной карте. |
| You cannot move that. | Вы не можете это двигать. |
| That token is not on the map. | Этой фишки нет на карте. |
| There is no combat. | Боя нет. |
| A combat is already running. | Бой уже идёт. |
| You cannot roll for that. | Вы не можете бросать за него. |
| Initiative is already rolled. Ask the GM to change it. | Инициатива уже брошена. Попросите мастера изменить её. |
| Only the GM or the player whose turn it is can end it. | Закончить ход могут только мастер или игрок, чей сейчас ход. |
| That turn is already over. | Этот ход уже закончился. |
| Only the GM or the Display can draw. | Рисовать могут только мастер и экран стола. |
| Only the GM or the Display can move areas. | Перемещать области могут только ГМ или Экран. |
| Only the GM or the Display can erase. | Стирать могут только мастер и экран стола. |
| Only the GM or the Display can clean the map. | Очищать карту могут только мастер и экран стола. |
| Only the GM or the Display can ping. | Ставить метки могут только мастер и экран стола. |
| Ping the map. | Поставьте метку на карте. |
| Round {round}: {name}'s turn. | Раунд {round}: ход — {name}. |
| {status} ends. | {status} заканчивается. |
| End of turn | Конец хода |
| {name} rolls Initiative: {n}. | {name} бросает инициативу: {n}. |
| Combat begins. Roll for Initiative. | Бой начинается. Бросайте инициативу. |
| Combat begins. Round 1. | Бой начинается. Раунд 1. |
| Combat ends after {n} round(s). | Бой окончен (раундов: {n}). |
| Combat cancelled. | Бой отменён. |
| Choose a character or a temp NPC. | Выберите персонажа или временного НПС. |
| Invalid picture. | Неверная картинка. |
| That picture no longer exists. | Этой картинки больше нет. |
| At most {max} pictures each. | Не более {max} картинок у каждого. |
| Size must be from 1 to {max} squares. | Размер должен быть от 1 до {max} клеток. |
| Invalid scene. | Неверная сцена. |
| That scene no longer exists. | Этой сцены больше нет. |
| The picture has an unusable shape. | У картинки неподходящая форма. |
| That grid does not fit. | Такая сетка не подходит. |
| That grid leaves no room on the picture. | При такой сетке на картинке не остаётся места. |
| Unknown mode. | Неизвестный режим. |
| Invalid stage entry. | Неверная запись сцены. |
| That character is no longer on stage. | Этого персонажа больше нет на сцене. |
| Already on stage. | Уже на сцене. |
| That spot is too far from the scene. | Это место слишком далеко от сцены. |
| Size must be between {min} and {max}. | Размер должен быть от {min} до {max}. |
| Stat | Характеристика |
| Combat Mastery | Боевое мастерство |
| Mastery tier | Уровень мастерства |
| Unknown field. | Неизвестное поле. |
| Only NPCs can be Minions. | Приспешниками могут быть только НПС. |
| Minion must be true or false. | Значение «приспешник» должно быть «да» или «нет». |
| Invalid weapon. | Неверное оружие. |
| Invalid resistance. | Неверное сопротивление. |
| Text can be at most {max} characters. | Текст может содержать не более {max} символов. |
| Too many features. | Слишком много особенностей. |
| Unknown action. | Неизвестное действие. |
| Too many items. | Слишком много предметов. |
| Invalid states. | Неверные состояния. |
| Invalid state. | Неверное состояние. |
| No uses left. | Использований не осталось. |
| A character holds at most {max} Help Dice. | У персонажа не больше {max} кубиков помощи. |
| That die is no longer there. | Этого кубика уже нет. |
| Too many spells. | Слишком много заклинаний. |
| Unknown list. | Неизвестный список. |
| Spell crafting (Magic Roll) | Создание заклинания (бросок Магии) |
| That spell no longer exists. | Этого заклинания больше нет. |
| That draft no longer exists. | Этого черновика больше нет. |
| You need {need} {stone} stones and have {have}. | Нужно камней ({stone}): {need}, у вас {have}. |
| Only the GM can change that. | Это может менять только ГМ. |
| A destroyed spell cannot be changed. | Уничтоженное заклинание изменить нельзя. |
| Crafts | Создаёт |
| {label} {spell}. | {label} {spell}. |
| That Stance no longer exists. | Этой Стойки больше нет. |
| Unknown sign. | Неизвестный знак. |
| Too many Stances. | Слишком много Стоек. |
| A base Stance cannot be deleted. | Базовую Стойку нельзя удалить. |
| Choose a weapon first. | Сначала выберите оружие. |
| That Enhancement no longer exists. | Этого усиления больше нет. |
| Each Enhancement is listed once; set how many times to use it. | Каждое усиление указывается один раз; задайте, сколько раз его использовать. |
| {name} can be used at most {max} times per attack. | {name} можно использовать не более {max} раз за атаку. |
| An item this Enhancement needs is no longer on the sheet. | Предмета, который нужен этому усилению, больше нет на листе. |
| {name} has {have} uses left and this attack needs {need}. | У предмета {name} осталось {have} исп., а атаке нужно {need}. |
| That is too much AP for one attack. | Это слишком много ОД для одной атаки. |
| Dodge | Уклонение |
| The next attack made against you before your next turn starts has Disadvantage. | Следующая атака против вас до начала вашего следующего хода совершается с помехой. |
| Full Dodge | Полное уклонение |
| Every attack made against you until your next turn starts has Disadvantage. | Каждая атака против вас до начала вашего следующего хода совершается с помехой. |
| Disengage | Отход |
| Opportunity Attacks against you have Disadvantage until your next turn starts. | Атаки по возможности против вас совершаются с помехой до начала вашего следующего хода. |
| Opportunity Attacks against you have Disadvantage. | Атаки по возможности против вас совершаются с помехой. |
| Full Disengage | Полный отход |
| You are immune to Opportunity Attacks until your next turn starts. | Вы неуязвимы для атак по возможности до начала вашего следующего хода. |
| Immune to Opportunity Attacks. | Неуязвим для атак по возможности. |
| Make an attack from the footer of the Arcane tab. Its AP is the cost of the weapon and the Enhancements you choose. | Совершите атаку из нижней панели вкладки «Тайное». Её ОД — это цена оружия и выбранных усилений. |
| Spend 1 AP to move up to your Movement in Spaces. Use the D-pad or drag your token; the AP is spent for you. | Потратьте 1 ОД, чтобы переместиться на расстояние до вашего Движения в клетках. Используйте крестовину или перетащите фишку; ОД тратится само. |
| Spell | Заклинание |
| Spend AP to cast a crafted spell: choose it as the weapon in the Magic tab and attack. | Потратьте ОД, чтобы применить созданное заклинание: выберите его оружием во вкладке «Магия» и атакуйте. |
| Spend 1 AP: the next attack made against you before the start of your next turn has Disadvantage. | Потратьте 1 ОД: следующая атака против вас до начала вашего следующего хода совершается с помехой. |
| Spend 2 AP: all attacks made against you until the start of your next turn have Disadvantage. | Потратьте 2 ОД: все атаки против вас до начала вашего следующего хода совершаются с помехой. |
| Spend 1 AP: Opportunity Attacks against you have Disadvantage until the start of your next turn. | Потратьте 1 ОД: атаки по возможности против вас совершаются с помехой до начала вашего следующего хода. |
| Spend 2 AP: you are immune to Opportunity Attacks until the start of your next turn. | Потратьте 2 ОД: вы неуязвимы для атак по возможности до начала вашего следующего хода. |
| Spend 1 AP to hide from creatures that cannot see you. Roll against their Awareness; on a success you become Hidden (add the status). | Потратьте 1 ОД, чтобы скрыться от существ, которые вас не видят. Бросьте против их Внимательности; при успехе вы Скрыты (добавьте состояние). |
| Help | Помощь |
| Spend 1 AP to give another creature a d8 Help Die until the start of your next turn. Select the creature first. | Потратьте 1 ОД, чтобы дать другому существу кубик помощи d8 до начала вашего следующего хода. Сначала выберите существо. |
| Object | Предмет |
| Spend 1 AP to drink or give a potion, work a lock or a mechanism, or hand an item to another creature. | Потратьте 1 ОД, чтобы выпить или дать зелье, открыть замок или механизм либо передать предмет другому существу. |
| Feint | Финт |
| Spend 1 AP and roll against the target's Awareness. On a success the next attack against the target before the start of your next turn has Advantage and +1 damage. | Потратьте 1 ОД и бросьте против Внимательности цели. При успехе следующая атака по цели до начала вашего следующего хода совершается с преимуществом и наносит +1 урона. |
| Taunt | Провокация |
| Spend 1 AP to taunt a creature that can see or hear you within 10 Spaces. Roll against its Mental Save; on a success it is Taunted for 1 Round. | Потратьте 1 ОД, чтобы спровоцировать существо, которое видит или слышит вас, в пределах 10 клеток. Бросьте против его ментального спасброска; при успехе оно Спровоцировано на 1 раунд. |
| Intimidate | Запугивание |
| Spend 1 AP to intimidate a creature that can see or hear you within 10 Spaces. Roll against its Mental Save; on a success it is Intimidated until the end of your next turn. | Потратьте 1 ОД, чтобы запугать существо, которое видит или слышит вас, в пределах 10 клеток. Бросьте против его ментального спасброска; при успехе оно Запугано до конца вашего следующего хода. |
| Grapple | Захват |
| With a free hand, spend 1 AP to grab a creature within 1 Space. Roll against its Body Movement or Weight Manipulation; on a success it is Grappled. | Свободной рукой потратьте 1 ОД, чтобы схватить существо в пределах 1 клетки. Бросьте против его Движения тела или Управления весом; при успехе оно Схвачено. |
| Shove | Толчок |
| Spend 1 AP to push a creature within 1 Space. Roll against its Body Movement or Weight Manipulation; on a success it is pushed 1 Space (1 more for every 5 over), or knocked Prone instead. | Потратьте 1 ОД, чтобы толкнуть существо в пределах 1 клетки. Бросьте против его Движения тела или Управления весом; при успехе оно отброшено на 1 клетку (на 1 больше за каждые 5 сверх) или сбито с ног. |
| Tackle | Бросок в ноги |
| After moving at least 2 Spaces in a straight line, spend 1 AP to tackle a creature your size or smaller. Roll against its Body Movement or Weight Manipulation; on a success you Grapple it and you both fall Prone. | Пройдя не менее 2 клеток по прямой, потратьте 1 ОД, чтобы сбить существо вашего размера или меньше. Бросьте против его Движения тела или Управления весом; при успехе вы схватываете его, и вы оба падаете. |
| Throw | Бросок предмета |
| Spend 1 AP to throw an object, or a creature you have Grappled. The distance depends on your Strength; a throw at a target is a ranged attack. | Потратьте 1 ОД, чтобы бросить предмет или схваченное вами существо. Дальность зависит от вашей Силы; бросок в цель — дальняя атака. |
| Disarm | Обезоруживание |
| Spend 1 AP to make an attack roll against a creature's Body Movement, Weight Manipulation or Fine Motor Skills (its choice). On a success the object it holds falls within 1 Space. | Потратьте 1 ОД и совершите бросок атаки против Движения тела, Управления весом или Мелкой моторики существа (на его выбор). При успехе предмет в его руках падает в пределах 1 клетки. |
| Analyze Creature | Изучить существо |
| Spend 1 AP to recall or discern information about a creature you can see or hear. Roll a DC 10 Symbolism check; each 5 over teaches one more statistic. | Потратьте 1 ОД, чтобы вспомнить или разглядеть сведения о существе, которое вы видите или слышите. Бросьте проверку Символизма со сложностью 10; каждые 5 сверх открывают ещё один показатель. |
| Calm Animal | Успокоить животное |
| Spend 1 AP to beguile a beast that can see or hear you. Roll against its Mental Save; on a success it is Taunted by you for 1 minute. | Потратьте 1 ОД, чтобы очаровать зверя, который видит или слышит вас. Бросьте против его ментального спасброска; при успехе он Спровоцирован вами на 1 минуту. |
| Combat Insight | Боевая проницательность |
| Spend 1 AP to discern what a creature will do on its next turn. Roll against its Likability or Fine Motor Skills; on a success you learn whether it attacks, casts or flees. | Потратьте 1 ОД, чтобы угадать, что существо сделает в свой следующий ход. Бросьте против его Обаяния или Мелкой моторики; при успехе вы узнаёте, будет ли оно атаковать, колдовать или бежать. |
| Conceal | Спрятать предмет |
| Spend 1 AP to hide an object on yourself or nearby. Roll Fine Motor Skills against the Awareness of creatures that can see you; on a success it is Hidden from those you beat. | Потратьте 1 ОД, чтобы спрятать предмет на себе или рядом. Бросьте Мелкую моторику против Внимательности существ, которые вас видят; при успехе предмет Скрыт от тех, кого вы превзошли. |
| Investigate | Исследовать |
| Spend 1 AP to uncover a concealed object, a secret compartment or the function of a mechanism within 1 Space. Roll Awareness against the concealing roll or a DC. | Потратьте 1 ОД, чтобы найти спрятанный предмет, тайник или понять действие механизма в пределах 1 клетки. Бросьте Внимательность против броска сокрытия или сложности. |
| Spend 1 AP to locate hidden creatures and concealed objects in your line of sight. Roll Awareness against their hiding roll. | Потратьте 1 ОД, чтобы найти скрытых существ и спрятанные предметы в поле зрения. Бросьте Внимательность против их броска сокрытия. |
| Medicine | Медицина |
| Spend 1 AP to tend to a creature you touch. Roll a DC 10 Symbolism check. Success: you stop its Bleeding or stabilize it; each 5 over gives it 1 Temp HP. | Потратьте 1 ОД, чтобы помочь существу, которого вы касаетесь. Бросьте проверку Символизма со сложностью 10. При успехе вы останавливаете его Кровотечение или стабилизируете его; каждые 5 сверх дают ему 1 врем. ОЗ. |
| Pass Through | Пройти сквозь |
| Spend 1 AP to move through the Space of a hostile creature within 1 size of you. Roll against it; on a success its Space is difficult terrain for you (no penalty if you beat it by 5). | Потратьте 1 ОД, чтобы пройти через клетку враждебного существа, отличающегося от вас не более чем на 1 размер. Бросьте против него; при успехе его клетка для вас — труднопроходимая местность (без штрафа, если вы превзошли его на 5). |
| Extend Jump | Дальний прыжок |
| When you jump, spend 1 AP to increase the distance. Roll a DC 10 Body Movement check: on a failure +1, on a success +2, and +1 more for every 5 over. | Прыгая, потратьте 1 ОД, чтобы увеличить дальность. Бросьте проверку Движения тела со сложностью 10: при провале +1, при успехе +2 и ещё +1 за каждые 5 сверх. |
| Critical Hit ({severity}) | Критическое попадание ({severity}) |
| Consumption: heals {n} | Поглощение: лечит на {n} |
| Immune | Иммунитет |
| Resistance {flat}: {v} | Сопротивление {flat}: {v} |
| Half: {v} | Половина: {v} |
| Double: {v} | Двойной: {v} |
| Effects {n}: {v} | Эффекты {n}: {v} |
| Until end of turn | До конца хода |
| Until start of next turn | До начала следующего хода |
| 1 Minute | 1 минута |
| Long | Долгий |
| Rolls | Броски |
| Against the bearer | Против носителя |
| Movement, AP and HP | Движение, ОД и ОЗ |
| Damage, Crit and DC | Урон, крит и сложность |
| Starts with | В начале |
| All rolls | Все броски |
| All Attribute rolls | Все проверки характеристик |
| All Saves | Все спасброски |
| All Skill rolls | Все проверки навыков |
| All Combat Mastery rolls | Все проверки боевого мастерства |
| All attacks | Все атаки |
| Weapon attacks | Атаки оружием |
| Magic attacks | Магические атаки |
| Manifest attacks | Атаки проявления |
| Initiative | Инициатива |
| Custom | Свой |
| Unknown stat. | Неизвестная характеристика. |
| That stat has no Save. | У этой характеристики нет спасброска. |
| Unknown skill. | Неизвестный навык. |
| Unknown Combat Mastery. | Неизвестное боевое мастерство. |
| Unknown roll type. | Неизвестный вид броска. |
| 1 Round | 1 раунд |
| Repeated | Повторяющийся |

## Unused (no longer in the app)

| English | Russian |
| --- | --- |
| Using an action spends its AP and does what it says. Actions that aim at others use the selected targets. | Использование действия тратит его ОД и делает то, что в нём сказано. Действия, направленные на других, используют выбранные цели. |
| One | Одна |
| Several | Несколько |
| Nobody is targeted: it is for the acting character. | Целей нет: действие для самого персонажа. |
| Selected targets: {n}. Select them in the Targets list of the General tab first. | Выбрано целей: {n}. Сначала выберите их в списке целей во вкладке «Общее». |
| Choose how many targets it has. | Выберите, сколько у него целей. |
| Select exactly one target first. | Сначала выберите ровно одну цель. |
| Runes are a placeholder for now: put them in the order you want. | Руны пока заглушка: расставьте их в нужном порядке. |
| Move left | Сдвинуть влево |
| Move right | Сдвинуть вправо |
| {name} gains a Help Die (d{sides}). | {name} получает кубик помощи (d{sides}). |
| {name} gains a Help Die (d{sides}) in place of a d{old}. | {name} получает кубик помощи (d{sides}) вместо d{old}. |
| {name} holds too many Help Dice: the new d{sides} is lost. | У {name} слишком много кубиков помощи: новый d{sides} пропадает. |
| {name} gains {n} Temp HP. | {name} получает {n} врем. ОЗ. |
| {name} already has {have} Temp HP, so the new {n} does not stack. | У {name} уже {have} врем. ОЗ, поэтому новые {n} не суммируются. |
| {attacker} attacks {target} with {weapon}: {total} vs {defence} {value}, {result}. | {attacker} атакует {target} ({weapon}): {total} против {defence} {value}, {result}. |
| Damage {formula}. | Урон {formula}. |
| Damage {formula} {kind}. | Урон {formula} ({kind}). |
| Heals {n}. | Лечит на {n}. |
| HP {from} to {to}. | ОЗ {from} → {to}. |
| Adds {list}. | Накладывает: {list}. |
| {name} takes {n} {kind} damage as a cost (HP {from} to {to}). | {name} получает {n} урона ({kind}) в качестве цены (ОЗ {from} → {to}). |
| {name} gains {status} as a cost. | {name} получает {status} в качестве цены. |
| {name} spends {n} uses of {item}. | {name} тратит {n} исп. предмета {item}. |
| {name} spends {n} AP. | {name} тратит ОД: {n}. |
| {name} gains Exposed 1 (natural 1). | {name} получает состояние «Раскрыт» 1 (натуральная 1). |
| {name} crafts the spell {spell}. | {name} создаёт заклинание {spell}. |
| Current AP | Текущие ОД |
| {cols} x {rows} squares. Line the grid up with the map; sizes are a share of the picture's width. | {cols} x {rows} клеток. Совместите сетку с картой; размеры заданы долей от ширины картинки. |
| Square size | Размер клетки |
| Shift right | Сдвиг вправо |
| Shift down | Сдвиг вниз |
| This part of the Arcane tab is not built yet. | Эта часть вкладки Аркана ещё не готова. |
| Open a character's Arcane tab to work with its Magic. | Откройте вкладку Аркана персонажа, чтобы работать с его Магией. |
| Targets: | Цели: |
| Roll attack | Бросить атаку |
| {name} attacks ({mastery}) | {name} атакует ({mastery}) |
| {attacker} attacks {target} ({mastery}): {total} vs {defence} {value}, {result}. | {attacker} атакует цель {target} ({mastery}): {total} против {defence} {value}, {result}. |
| Choose a Combat Mastery. | Выберите боевое мастерство. |
| A basic attack costs 1 or 2 AP. | Базовая атака стоит 1 или 2 ОД. |

