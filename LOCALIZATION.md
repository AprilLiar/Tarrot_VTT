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
| Settings | Настройки |
| Who are you? | Кто вы? |
| Dismiss | Закрыть |
| Game Master | Мастер игры |
| Display Screen | Экран стола |
| Shows the current scene on the table screen | Показывает текущую сцену на экране стола |
| Player characters | Персонажи игроков |
| No characters yet. Ask the GM to create one. | Персонажей пока нет. Попросите мастера создать персонажа. |
| Back | Назад |
| These settings are saved on this device only. | Эти настройки сохраняются только на этом устройстве. |
| Language | Язык |
| Characters | Персонажи |
| Scene | Сцена |
| Sheet | Лист |
| GM | МИ |
| Sections | Разделы |
| Reconnecting... | Переподключение... |
| Switch | Сменить |
| Item offered | Предложен предмет |
| {from} wants to give you {item}. | {from} хочет отдать вам предмет: {item}. |
| Decline | Отказаться |
| Accept | Принять |
| That file is not an image this browser can read. | Этот файл не является изображением, которое может прочитать браузер. |
| Choose an image file. | Выберите файл изображения. |
| That image is too large even after resizing. Try a smaller one. | Изображение слишком большое даже после уменьшения. Попробуйте меньшее. |

## Characters and roster (GM)

| English | Russian |
| --- | --- |
| Cancel | Отмена |
| New character | Новый персонаж |
| Create | Создать |
| Name | Имя |
| Type | Тип |
| PC | Игрок |
| NPC | НПС |
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
| Delete | Удалить |
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
| Damage type | Тип урона |
| AP cost | Стоимость ОД |
| Remove {name} | Убрать: {name} |
| Advantage | Преимущество |
| Disadvantage | Помеха |
| Close | Закрыть |
| Send | Отправить |
| Picture | Картинка |
| Save | Сохранить |
| Pictures | Картинки |
| Search | Поиск |
| Battle | Бой |
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
| AP | ОД |
| Movement per AP | Движение за 1 ОД |
| Banked | Накоплено |
| Move {dir} | Шаг: {dir} |
| Free Movement (does not spend Movement or AP) | Свободное перемещение (не тратит движение и ОД) |
| Attack | Атака |
| No AP left to attack. | Не осталось ОД для атаки. |
| Select a target below first. | Сначала выберите цель ниже. |
| Targets (tap again to deselect) | Цели (нажмите ещё раз, чтобы снять выбор) |
| Nobody else is on the map. | На карте больше никого нет. |
| Clear targets | Снять все цели |
| Spend AP to move? | Потратить ОД на движение? |
| Spend {aps} AP for {movement} Movement? | Потратить ОД ({aps}) ради движения ({movement})? |
| No | Нет |
| Yes | Да |
| Targets: | Цели: |
| Combat Mastery | Боевое мастерство |
| Defence it is rolled against | Защита, против которой бросок |
| vs Physical Defence | против физической защиты |
| vs Mental Defence | против ментальной защиты |
| {n} AP | {n} ОД |
| You have {n} AP. | У вас {n} ОД. |
| Extra Advantage levels | Дополнительные уровни преимущества |
| Fewer levels | Меньше уровней |
| More levels | Больше уровней |
| Custom modifier | Свой модификатор |
| Roll attack | Бросить атаку |
| Height (Spaces in the air, shown above the token) | Высота (клеток над землёй, показывается над фишкой) |
| Immunity | Иммунитет |
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
| No matching statuses. | Подходящих состояний нет. |
| Statuses | Состояния |
| No statuses. | Состояний нет. |
| Decrease {name} | Уменьшить: {name} |
| Increase {name} | Увеличить: {name} |
| Toggle full text of {name} | Показать или скрыть полный текст: {name} |
| Description | Описание |
| Edit feature | Изменить особенность |
| New feature | Новая особенность |
| Add | Добавить |
| Delete feature | Удалить особенность |
| Features | Особенности |
| Add feature | Добавить особенность |
| Edit item | Изменить предмет |
| New item | Новый предмет |
| Max uses (1 to {max}) | Максимум использований (от 1 до {max}) |
| State options | Варианты состояния |
| None yet | Пока нет |
| New state | Новое состояние |
| Give {name} | Передать: {name} |
| Offer {name} | Предложить: {name} |
| Give | Передать |
| Send offer | Отправить предложение |
| The other player must accept before the item moves. | Другой игрок должен принять предмет, прежде чем он перейдёт. |
| Nobody to send it to. | Некому отправить. |
| Send to | Отправить кому |
| (empty) | (пусто) |
| Use | Использовать |
| Uses | Использования |
| {name} uses | Использования: {name} |
| State | Состояние |
| (none) | (нет) |
| Edit | Изменить |
| Copy | Копировать |
| Delete item | Удалить предмет |
| Delete {name}? This cannot be undone. | Удалить: {name}? Это нельзя отменить. |
| Inventory | Инвентарь |
| Add item | Добавить предмет |
| Could not load the sheet. | Не удалось загрузить лист. |
| That change was not saved. | Изменение не сохранено. |
| The roll failed. | Бросок не удался. |
| Loading sheet... | Загрузка листа... |
| Back to roster | Назад к списку |
| Vitals | Показатели |
| Action Points | Очки действий |
| Current AP | Текущие ОД |
| Minion | Приспешник |
| Hit Points | Очки здоровья |
| Current HP | Текущие ОЗ |
| Max HP | Макс. ОЗ |
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
| Roll | Бросок |
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
| vs | против |
| Chat | Чат |
| Clear | Очистить |
| No messages yet. Rolls show up here. | Сообщений пока нет. Здесь появляются броски. |
| Message | Сообщение |
| Clear chat | Очистить чат |
| Delete every message for everyone? This cannot be undone. | Удалить все сообщения у всех? Это нельзя отменить. |

## Attacks

| English | Russian |
| --- | --- |
| Attacks waiting: {n} | Атак ожидает: {n} |
| {name} attacks ({mastery}) | {name} атакует ({mastery}) |
| Rolled {total} (natural {natural}) against {label} | Выпало {total} (на кубике {natural}) против: {label} |
| Total | Итог |
| Attack total | Итог атаки |
| Base damage | Базовый урон |
| True (ignores resistances) | Чистый (игнорирует сопротивления) |
| {name} stacks | Число накоплений: {name} |
| Add a status | Добавить состояние |
| Add status... | Добавить состояние... |
| no sheet | нет листа |
| heals {n} | лечит на {n} |
| {n} damage | урон {n} |
| HP {from} to {to} | ОЗ {from} → {to} |
| None of the targets is on the map any more. | Ни одной из целей больше нет на карте. |
| Discard | Отклонить |
| Later | Позже |
| Apply | Применить |

## Battle map and combat

| English | Russian |
| --- | --- |
| Token Settings: {name} | Настройки фишки: {name} |
| Size: {n} x {n} squares (set on the character sheet or the temp NPC). | Размер: {n} x {n} клеток (задаётся в листе персонажа или у временного НПС). |
| Banked Movement: {n}. | Накопленное движение: {n}. |
| Remove from the map | Убрать с карты |
| Clear banked Movement | Сбросить накопленное движение |
| Grid | Сетка |
| {cols} x {rows} squares. Line the grid up with the map; sizes are a share of the picture's width. | {cols} x {rows} клеток. Совместите сетку с картой; размеры заданы долей от ширины картинки. |
| Square size | Размер клетки |
| Shift right | Сдвиг вправо |
| Shift down | Сдвиг вниз |
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
| Area | Область |
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
| Circle | Круг |
| Cone | Конус |
| Arc | Дуга |
| Line | Линия |
| Square | Квадрат |
| Squares | Клеток |
| Template size | Размер области |
| More squares | Больше клеток |
| Fewer squares | Меньше клеток |
| Press for the start, drag for the direction. | Нажмите для начала, потяните для направления. |
| Click a drawing or an area to remove it. | Щёлкните по рисунку или области, чтобы убрать их. |
| Token Settings | Настройки фишки |
| Reveal | Показать |
| Hide | Скрыть |
| Set Height | Высота |
| Remove | Убрать |
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
| Loading... | Загрузка... |
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
| Magic | Магия |
| Mastery: Magic | Мастерство: Магия |
| Magic (Combat Mastery Roll) | Магия (проверка боевого мастерства) |
| Magic attack | Атака: Магия |
| Stances | Стойки |
| Mastery: Stances | Мастерство: Стойки |
| Stances (Combat Mastery Roll) | Стойки (проверка боевого мастерства) |
| Stances attack | Атака: Стойки |
| Manifest | Проявление |
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
| {what} must be a whole number from {min} to {max}. | Значение «{what}» должно быть целым числом от {min} до {max}. |
| Choose a damage type. | Выберите тип урона. |
| Unknown status. | Неизвестное состояние. |
| {attacker} attacks {target} ({mastery}): {total} vs {defence} {value}, {result}. | {attacker} атакует цель {target} ({mastery}): {total} против {defence} {value}, {result}. |
| Damage {formula}. | Урон {formula}. |
| Damage {formula} {kind}. | Урон {formula} ({kind}). |
| After resistances: {steps}. | С учётом сопротивлений: {steps}. |
| Set by the GM to {n}. | Мастер установил: {n}. |
| Heals {n}. | Лечит на {n}. |
| {n} damage. | Урон: {n}. |
| HP {from} to {to}. | ОЗ {from} → {to}. |
| (temporary NPC: no sheet, apply by hand) | (временный НПС: листа нет, примените вручную) |
| Adds {list}. | Накладывает: {list}. |
| {name} spends {n} AP. | {name} тратит ОД: {n}. |
| {name} gains Exposed 1 (natural 1). | {name} получает состояние «Раскрыт» 1 (натуральная 1). |
| Combat | Бой |
| That attack is no longer waiting. | Эта атака больше не ожидает. |
| Choose a Combat Mastery. | Выберите боевое мастерство. |
| A basic attack costs 1 or 2 AP. | Базовая атака стоит 1 или 2 ОД. |
| Choose Physical or Mental Defence. | Выберите физическую или ментальную защиту. |
| Not enough AP: this attack costs {cost} and you have {have}. | Не хватает ОД: атака стоит {cost}, а у вас {have}. |
| Select at least one target first. | Сначала выберите хотя бы одну цель. |
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
| {name} takes {amount} damage from {source} ({detail}). HP {from} to {to}. | {name} получает урон {amount} от источника: {source} ({detail}). ОЗ {from} → {to}. |
| true damage | чистый урон |
| {name} is healed {n} by {source} ({detail}). HP {from} to {to}. | {name} исцеляется на {n} от источника: {source} ({detail}). ОЗ {from} → {to}. |
| {name} takes no damage from {source} ({detail}). | {name} не получает урона от источника: {source} ({detail}). |
| {name} starts with {ap} AP instead of {max} ({reasons}). | {name} начинает ход с {ap} ОД вместо {max} ({reasons}). |
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
| No image was sent. | Изображение не было отправлено. |
| Images can be at most {mb} MB after resizing. | После уменьшения изображение может занимать не более {mb} МБ. |
| Only PNG, JPEG and WebP images are accepted. | Принимаются только изображения PNG, JPEG и WebP. |
| A name is required. | Нужно указать имя. |
| Names can be at most {max} characters. | Имя может содержать не более {max} символов. |
| Invalid id. | Неверный идентификатор. |
| Type must be PC or NPC. | Тип должен быть «Игрок» или «НПС». |
| Type the exact name to confirm deletion. | Введите точное имя для подтверждения удаления. |
| GM only. | Только для мастера. |
| Only the GM or the Display can change a size. | Менять размер могут только мастер и экран стола. |
| The Display Screen cannot summon. | Экран стола не может вызывать персонажей. |
| You can only summon your own character. | Вы можете вызвать только своего персонажа. |
| You can only dismiss your own character. | Вы можете убрать только своего персонажа. |
| Only the GM or the Display can change a figure. | Менять фигуру могут только мастер и экран стола. |
| You can only move your own character. | Вы можете двигать только своего персонажа. |
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
| Only the GM or the Display can erase. | Стирать могут только мастер и экран стола. |
| Only the GM or the Display can clean the map. | Очищать карту могут только мастер и экран стола. |
| Only the GM or the Display can ping. | Ставить метки могут только мастер и экран стола. |
| Ping the map. | Поставьте метку на карте. |
| Round {round}: {name}'s turn. | Раунд {round}: ход — {name}. |
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
| HP | ОЗ |
| Stat | Характеристика |
| Mastery tier | Уровень мастерства |
| Stacks | Накопления |
| Max uses | Макс. использований |
| Unknown field. | Неизвестное поле. |
| Only NPCs can be Minions. | Приспешниками могут быть только НПС. |
| Minion must be true or false. | Значение «приспешник» должно быть «да» или «нет». |
| Invalid resistance. | Неверное сопротивление. |
| Text can be at most {max} characters. | Текст может содержать не более {max} символов. |
| That entry no longer exists. | Этой записи больше нет. |
| Too many features. | Слишком много особенностей. |
| Unknown action. | Неизвестное действие. |
| Too many items. | Слишком много предметов. |
| Invalid states. | Неверные состояния. |
| Invalid state. | Неверное состояние. |
| No uses left. | Использований не осталось. |
| Unknown list. | Неизвестный список. |
| Critical Hit ({severity}) | Критическое попадание ({severity}) |
| Consumption: heals {n} | Поглощение: лечит на {n} |
| Immune | Иммунитет |
| Resistance {flat}: {v} | Сопротивление {flat}: {v} |
| Half: {v} | Половина: {v} |
| Double: {v} | Двойной: {v} |
| Custom | Свой |
| Manual | Вручную |
| Advantage levels must be a whole number from -{max} to {max}. | Уровни преимущества должны быть целым числом от -{max} до {max}. |
| The custom modifier must be a whole number from -99 to 99. | Свой модификатор должен быть целым числом от -99 до 99. |
| Unknown stat. | Неизвестная характеристика. |
| That stat has no Save. | У этой характеристики нет спасброска. |
| Unknown skill. | Неизвестный навык. |
| Unknown Combat Mastery. | Неизвестное боевое мастерство. |
| Unknown roll type. | Неизвестный вид броска. |

