/**
 * Contextual help copy. Keys match data-help attributes.
 * Text explains features, never a specific player, score, or other record.
 */
window.IerneHelpCatalog = {
  pages: {
    home: {
      title: 'Home',
      body: 'The current competitions. Arrows move between them. A league card shows who is leading each group. A knockout card shows the bracket for the stage you are on. Tap ? then a control if you want that control explained.'
    },
    fixtures: {
      title: 'Fixtures',
      body: 'Matches in the competition you are viewing that do not have a result yet. Group buttons narrow the list. The V in the middle opens the result form when you are allowed to enter that match.'
    },
    results: {
      title: 'Results',
      body: 'Matches that already have a score. The score in the middle can be changed by an admin, or by a player in that match for 24 hours after it was posted. The winner’s name is in bold.'
    },
    leagues: {
      title: 'Leagues',
      body: 'Standings for the competition you are viewing, one table per group. Players are ordered by points, then frame difference. This page is hidden while a knockout is the competition on screen.'
    },
    handicaps: {
      title: 'Handicaps',
      body: 'Each player’s current handicap. On a fixture, tap a name to see the handicap that applied on the match date. Admins change handicaps from Manage Players.'
    },
    'top-breaks': {
      title: 'Top breaks',
      body: 'The highest breaks saved with match results for the current competition, highest first. Breaks are typed in the result form as a list of numbers.'
    },
    rules: {
      title: 'Rules',
      body: 'The written rules for the league. There are no extra controls on this page beyond the menu and the back-to-top button.'
    },
    'under-development': {
      title: 'Under development',
      body: 'A holding page. The tables here are not the live league. Use Leagues in the menu for the current standings.'
    },
    missing: {
      title: 'Page not found',
      body: 'That address is not a page on this site. Use the menu to go back to Home, Fixtures, or Results.'
    },
    'admin-competitions': {
      title: 'Manage comps',
      body: 'Create leagues and knockouts, mark which one is current, and attach groups or players. Unlock Admin Mode from the menu first. Saving a comp is what makes groups and rosters available.'
    },
    'admin-players': {
      title: 'Manage players',
      body: 'The list of players. Tap a row to edit that player’s name and handicap history, or use + Add Player. Unlock Admin Mode from the menu first.'
    },
    'admin-player': {
      title: 'Edit player',
      body: 'One player’s name, handicap history, and which comps they are on. Handicap rows are newest first. The current handicap is the latest effective date.'
    },
    'admin-fixtures': {
      title: 'Manage fixtures',
      body: 'Add or change matches for one competition. Pick the comp at the top, then use + Add Fixture or tap V on a row. Results are entered on the Fixtures and Results pages, not here.'
    },
    'admin-bulk-players': {
      title: 'Bulk load players',
      body: 'Paste rows of players (and optional handicaps) and import them in one go. You can also add each new player to a competition roster. Unlock Admin Mode first.'
    },
    'admin-bulk-fixtures': {
      title: 'Bulk load fixtures',
      body: 'Paste rows of matches for one competition and group, then import them. Each row is a week and two player names. Unlock Admin Mode first.'
    },
    'admin-accounts': {
      title: 'Accounts',
      body: 'Issue a one-time registration code so a player can connect, and manage existing accounts. A reset code lets someone set a new password. Codes are shown once. Unlock Admin Mode first.'
    }
  },
  topics: {
    'chrome.logo': {
      title: 'Home',
      body: 'Goes to the home page, which shows the current competitions.'
    },
    'chrome.menu': {
      title: 'Menu',
      body: 'Opens or closes the menu on a small screen. On a wide screen the links are already in the header, so this button is hidden.'
    },
    'chrome.navHome': {
      title: 'Home',
      body: 'Current competitions. Arrows move between them. A league shows group leaders; a knockout shows the bracket.'
    },
    'chrome.navLeagues': {
      title: 'Leagues',
      body: 'Standings for the competition on screen, split by group. This link is hidden while a knockout is the competition you are viewing.'
    },
    'chrome.navFixtures': {
      title: 'Fixtures',
      body: 'Upcoming matches with no result yet. If you are in the match, or you are an admin, V opens the result form.'
    },
    'chrome.navResults': {
      title: 'Results',
      body: 'Matches that already have a score. An admin, or a player in that match, can change the score for 24 hours after it was posted.'
    },
    'chrome.navBreaks': {
      title: 'Top breaks',
      body: 'The highest breaks recorded for the current competition.'
    },
    'chrome.navHandicaps': {
      title: 'Handicaps',
      body: 'Each player’s current handicap.'
    },
    'chrome.navRules': {
      title: 'Rules',
      body: 'The written rules for the league.'
    },
    'chrome.connect': {
      title: 'Connect',
      body: 'Sign in with the handle and password you chose when you registered. That lets you enter results for your own matches. Looking around the site does not need an account.'
    },
    'chrome.account': {
      title: 'Signed in',
      body: 'The handle you are using on this device. The same handle and password work anywhere. Sign out is a separate menu item.'
    },
    'chrome.signout': {
      title: 'Sign out',
      body: 'Signs this device out. The account stays; you can Connect again with the same handle and password.'
    },
    'chrome.adminUnlock': {
      title: 'Admin mode',
      body: 'Asks for the admin secret and unlocks the manage pages on this device until you lock it or the session ends. The label switches to Lock Admin Mode once it is unlocked. If you are signed in as an admin account, this item is hidden because admin mode is already on.'
    },
    'chrome.navManageComps': {
      title: 'Manage comps',
      body: 'Leagues and knockouts: name, type, which one is current, groups, and who plays in them.'
    },
    'chrome.navManagePlayers': {
      title: 'Manage players',
      body: 'Add a player or open one to change their name and handicaps.'
    },
    'chrome.navManageFixtures': {
      title: 'Manage fixtures',
      body: 'Add, edit, or delete matches for a competition. Entering the score is done on Fixtures and Results.'
    },
    'chrome.navBulkPlayers': {
      title: 'Bulk load players',
      body: 'Import many players (and handicaps) from pasted rows instead of adding them one by one.'
    },
    'chrome.navBulkFixtures': {
      title: 'Bulk load fixtures',
      body: 'Import many matches for one competition and group from pasted rows.'
    },
    'chrome.navAccounts': {
      title: 'Accounts',
      body: 'Registration codes, password resets, and player accounts. A signed-in admin can open this without the separate admin secret.'
    },
    'chrome.backToTop': {
      title: 'Back to top',
      body: 'Scrolls the page back to the top.'
    },

    'page.compName': {
      title: 'This competition',
      body: 'The competition these fixtures, results, or standings belong to. Change it from the arrows on the home page. The choice is remembered as you move between Fixtures, Results, and Leagues.'
    },
    'page.groupFilter': {
      title: 'Group filter',
      body: 'Show one group only. Tap the selected group again to clear it and show every group. Hidden on a knockout, which has rounds instead of groups.'
    },
    'page.group': {
      title: 'One group',
      body: 'Limits the list to this group. Tap it again to show every group.'
    },

    'home.carousel': {
      title: 'Competitions',
      body: 'One card per current competition. Swipe or use the arrows. Choosing a card’s competition is what Fixtures, Results, and Leagues then show.'
    },
    'home.title': {
      title: 'Competition name',
      body: 'The name of the competition on screen. The arrows on either side move to the previous or next current competition.'
    },
    'home.prev': {
      title: 'Previous competition',
      body: 'Shows the previous current competition and makes that the one used on Fixtures, Results, and Leagues. Hidden when you are already on the first.'
    },
    'home.next': {
      title: 'Next competition',
      body: 'Shows the next current competition and makes that the one used on Fixtures, Results, and Leagues. Hidden when you are already on the last.'
    },
    'home.viewport': {
      title: 'Competition card',
      body: 'The card for the competition named above. A league lists each group and who is leading it. A knockout draws the bracket. This is a summary; open Fixtures or Leagues for the full list.'
    },
    'home.leagueCard': {
      title: 'League leaders',
      body: 'Each group in this league and the player (or players, if tied) at the top on points and frame difference. It is a snapshot, not the full table. Open Leagues for every player.'
    },
    'home.knockoutCard': {
      title: 'Knockout bracket',
      body: 'The knockout for this competition. Arrows move between rounds. A name in bold has won that match. Scores are frames, not breaks.'
    },

    'ko.prev': {
      title: 'Earlier round',
      body: 'Moves the bracket back to the previous round, such as from the semi-finals to the quarter-finals.'
    },
    'ko.next': {
      title: 'Later round',
      body: 'Moves the bracket on to the next round.'
    },
    'ko.stage': {
      title: 'Round name',
      body: 'Which round of the bracket you are looking at. The arrows on either side change the round. The matches underneath are that round only.'
    },
    'ko.match': {
      title: 'A knockout match',
      body: 'Two players and their frame scores when the match has been played. The winner’s row is emphasised. A dash means that side has no score yet. This note is about the card, not about the players on it.'
    },

    'fixtures.list': {
      title: 'Fixture list',
      body: 'Upcoming matches, grouped by week or by knockout round. A name can be tapped for that player’s handicap on the match date. V opens the result form when you are allowed to enter it.'
    },
    'fixtures.row': {
      title: 'A fixture',
      body: 'One match that has not been scored yet. Tap a name for the handicap. The V in the middle is the result button when you can enter this match.'
    },
    'fixtures.enterResult': {
      title: 'Enter result',
      body: 'Opens the result form for this match: date, frames, breaks, and an optional photo of the paper slip. You see this when you are an admin, or you are signed in as one of the two players. On a knockout it stays a plain V until both players are known.'
    },
    'fixtures.vs': {
      title: 'Versus',
      body: 'Separates the two players. It is not a button when you cannot enter this result: you are not in the match, you are not signed in, or a knockout place is still waiting on an earlier round.'
    },
    'fixtures.player': {
      title: 'Player handicap',
      body: 'Shows the handicap that applied to this player on the match date. It does not open their profile. Handicaps are changed by an admin.'
    },

    'results.list': {
      title: 'Results list',
      body: 'Played matches, grouped by week or round. The score in brackets is frames. Tap it to edit when you are allowed. The line under a score says who entered it.'
    },
    'results.editScore': {
      title: 'Edit result',
      body: 'Opens the same result form as fixtures, filled in with this score. An admin can always change it. A player in the match can change it for 24 hours after it was posted. Setting both scores back to zero clears the result after you confirm.'
    },
    'results.score': {
      title: 'Frame score',
      body: 'Frames won by the player on the left, then the player on the right. It is not editable from this device: either the 24-hour window has passed, or you are not signed in as a player in the match or as an admin.'
    },
    'results.enteredBy': {
      title: 'Who entered it',
      body: 'The account that saved this result. It is a record of who posted the score, not a way to contact them.'
    },

    'result.dialog': {
      title: 'Enter result',
      body: 'Record the match date, how many frames each player won, any breaks, and optionally a photo of the signed slip. Save writes the result. Cancel closes the form and drops a photo that was not saved with a result. Tap ? then a field for that field.'
    },
    'result.date': {
      title: 'Match date',
      body: 'The day the match was played, as text such as 31 Jan 2026. It is used for the handicap that applied that day. The calendar button beside it fills this box.'
    },
    'result.datePicker': {
      title: 'Pick a date',
      body: 'Opens the device calendar and copies the chosen day into the match date box.'
    },
    'result.frames': {
      title: 'Frames',
      body: 'The triangle on the left lowers this player’s frame count. The triangle on the right raises it. The number is frames won, not points. You cannot go past the frames needed to win the match (best of three means first to two, and so on).'
    },
    'result.frameDec': {
      title: 'Fewer frames',
      body: 'Takes one frame off this player. It stops at zero. If both players are set to zero on a result that was already saved, Save asks you to confirm clearing it.'
    },
    'result.frameInc': {
      title: 'More frames',
      body: 'Gives this player one more frame. It stops when they have won the match, or when the other player already has. The name of the player who has reached the winning number is highlighted.'
    },
    'result.breaks': {
      title: 'Breaks',
      body: 'Breaks made by this player in the match, as numbers separated by commas or spaces, for example 32, 47. Each number must be from 1 to 155. They feed the Top Breaks list. Leave the box empty if there were none.'
    },
    'result.save': {
      title: 'Save',
      body: 'Stores the date, frame score, and breaks. A new result with both scores at zero is rejected. Clearing a result that was already saved asks you to confirm. A slip photo chosen in this visit is kept with the result when you save.'
    },
    'result.slip': {
      title: 'Result slip photo',
      body: 'Attach a photo of the paper result slip. With no photo yet, this offers the camera or the gallery. With a photo, it opens the picture so you can replace or remove it. The file is reduced in size in the browser before it is stored. Removing it does not delete the score.'
    },
    'result.cancel': {
      title: 'Cancel',
      body: 'Closes the form without saving. A slip photo added in this visit and not saved with the result is discarded.'
    },
    'result.enteredBy': {
      title: 'Entered by',
      body: 'Who posted the result that is already on this match. It updates when someone saves a change.'
    },
    'result.slipTake': {
      title: 'Take photo',
      body: 'Opens the camera to photograph the result slip. The picture is compressed before upload.'
    },
    'result.slipGallery': {
      title: 'Choose from gallery',
      body: 'Pick an existing picture of the result slip. It is compressed before upload.'
    },
    'result.slipCancel': {
      title: 'Cancel photo',
      body: 'Closes the photo choices and leaves the result form as it was.'
    },
    'result.slipClose': {
      title: 'Close photo',
      body: 'Closes the large view of the slip. The photo stays attached.'
    },
    'result.slipReplace': {
      title: 'Replace photo',
      body: 'Choose a different picture for this slip. The previous one is replaced when the new photo finishes uploading.'
    },
    'result.slipRemove': {
      title: 'Remove photo',
      body: 'Deletes the slip photo from this match. The frame score and breaks stay.'
    },

    'leagues.table': {
      title: 'Standings',
      body: 'One block per group. Columns are rank, player, played, won, lost, frame difference, and points. Tied points and frame difference share a rank. Names are shortened to fit the table.'
    },
    'leagues.group': {
      title: 'A group table',
      body: 'Standings for this group only. Rank uses points, then frame difference. This note is about the table, not about a particular player.'
    },

    'handicaps.table': {
      title: 'Handicap table',
      body: 'Player name and their current handicap. Older handicaps are kept as history and used when you tap a name on a past fixture. An admin edits them on the player’s page.'
    },

    'breaks.list': {
      title: 'Top breaks',
      body: 'Breaks saved on results, highest first. The number is the break. The text beside it is the player and the match. This list is the competition you last chose on the home page.'
    },
    'breaks.season': {
      title: 'Competition',
      body: 'Which competition these breaks belong to. Change the competition from the home page arrows, then come back here.'
    },
    'breaks.row': {
      title: 'A break',
      body: 'One recorded break. The figure is the break size. It is not a button. This note is about the row, not about the player named on it.'
    },

    'rules.body': {
      title: 'Rules text',
      body: 'The league rules. Nothing here is editable from the site.'
    },

    'sheet.connect': {
      title: 'Connect',
      body: 'Sign in with the handle and password from registration. That session lets this device enter your results. Forgot password needs a reset code from an admin. The original registration code cannot be reused.'
    },
    'sheet.connectHandle': {
      title: 'Handle',
      body: 'The short name you chose when you registered. It is letters and digits, and it is what you type to sign in on any device.'
    },
    'sheet.connectPassword': {
      title: 'Password',
      body: 'The password for this handle. It is not shown as you type. Use Forgot password if an admin has given you a reset code.'
    },
    'sheet.connectSubmit': {
      title: 'Connect',
      body: 'Signs this device in. If the handle or password is wrong, the form stays open and tells you.'
    },
    'sheet.connectCancel': {
      title: 'Cancel',
      body: 'Closes the sign-in form without signing in.'
    },
    'sheet.registerLink': {
      title: 'Register',
      body: 'Opens registration. You need a one-time code from an admin, then you pick a handle, a password, and which player you are.'
    },
    'sheet.forgot': {
      title: 'Forgot password',
      body: 'Opens the reset form. An admin must have issued a one-time reset code for your handle. It lasts 24 hours and cannot be reused.'
    },
    'sheet.register': {
      title: 'Register',
      body: 'Claim a one-time code: choose a handle, type the password twice, and pick the player this account belongs to. After that, Connect with the handle and password. The code cannot be used again.'
    },
    'sheet.registerCode': {
      title: 'Registration code',
      body: 'The one-time code an admin issued. It expires after 30 days and works once.'
    },
    'sheet.registerHandle': {
      title: 'Handle',
      body: '3 to 20 letters or digits. This is the name you will type to Connect. It has to be unique.'
    },
    'sheet.registerPassword': {
      title: 'Password',
      body: 'At least 8 characters. You will type this again, with the handle, whenever you Connect.'
    },
    'sheet.registerPassword2': {
      title: 'Repeat password',
      body: 'Type the same password again. Registration stops if the two boxes differ.'
    },
    'sheet.registerPlayer': {
      title: 'Which player',
      body: 'The league player this account represents. Only players who do not already have an account are listed. Results you enter are tied to this player.'
    },
    'sheet.registerSubmit': {
      title: 'Register',
      body: 'Creates the account and uses up the code. You can then Connect with the handle and password.'
    },
    'sheet.reset': {
      title: 'Reset password',
      body: 'Set a new password using a one-time reset code from an admin. Enter the handle, the code, and the new password. Then Connect again.'
    },
    'sheet.resetHandle': {
      title: 'Handle',
      body: 'The account whose password you are replacing.'
    },
    'sheet.resetCode': {
      title: 'Reset code',
      body: 'The one-time code an admin issued for this handle. It lasts 24 hours. The original registration code will not work here.'
    },
    'sheet.resetPassword': {
      title: 'New password',
      body: 'At least 8 characters. This replaces the old password when you update.'
    },
    'sheet.resetSubmit': {
      title: 'Update password',
      body: 'Saves the new password and uses up the reset code. Sign in afterwards with Connect.'
    },
    'sheet.adminUnlock': {
      title: 'Unlock admin mode',
      body: 'Enter the admin secret to show the manage pages on this device. It is not a player password. Lock Admin Mode in the menu removes it. Signing in as an admin account unlocks the same pages without this secret.'
    },
    'sheet.adminSecret': {
      title: 'Admin secret',
      body: 'The shared admin secret. It is checked with the server and, if it is right, stored for this browser session.'
    },
    'sheet.adminSubmit': {
      title: 'Unlock',
      body: 'Checks the secret and, if it matches, shows Manage Comps, Players, Fixtures, the bulk load pages, and Accounts.'
    },
    'sheet.adminCancel': {
      title: 'Cancel',
      body: 'Closes the unlock form and leaves admin mode as it was.'
    },

    'admin.addComp': {
      title: 'Add comp',
      body: 'Starts a new competition. Set the name and whether it is a league or a knockout, then save. Groups and players are added after the first save.'
    },
    'admin.listRow': {
      title: 'Open this row',
      body: 'Opens that competition, group, or player so you can change it. This note is about the row, not about the record named on it.'
    },
    'admin.compName': {
      title: 'Comp name',
      body: 'The name shown on the home page, fixtures, and standings.'
    },
    'admin.compType': {
      title: 'Comp type',
      body: 'League competitions have groups and a table. Knockout competitions have rounds and a bracket. The type is chosen when you create the comp.'
    },
    'admin.compCurrent': {
      title: 'Current',
      body: 'Marks this competition as the one the public site shows for its type. The home page lists current competitions. Turning this on for one league does not turn off a knockout, and the other way around.'
    },
    'admin.addGroup': {
      title: 'Add group',
      body: 'Creates a group inside this league, such as Group 1. Give it an id, a display name, an order, and at least two players. A player can only be in one group of this comp.'
    },
    'admin.addKnockout': {
      title: 'Add knockout stage',
      body: 'Links a knockout competition to this league so the site can move from the league table to that bracket. The knockout itself is a separate comp.'
    },
    'admin.compPlayers': {
      title: 'Knockout players',
      body: 'Tick the players who are in this knockout. The ticks are saved when you press Save Comp. A player already in another group of a league is not offered here if they cannot be added.'
    },
    'admin.playerTick': {
      title: 'Include this player',
      body: 'Ticks or unticks this player for the group or knockout you are editing. Nothing is stored until you save the group or the comp. This note is about the tick, not about the person named beside it.'
    },
    'admin.compDelete': {
      title: 'Delete comp',
      body: 'Deletes this competition. You will be asked to confirm. Use it only when the comp should disappear from the site.'
    },
    'admin.compCancel': {
      title: 'Cancel',
      body: 'Closes the comp form. Changes you have not saved are dropped.'
    },
    'admin.compSave': {
      title: 'Save comp',
      body: 'Writes the name, type, current flag, and knockout player ticks. A new comp must be saved once before you can add groups.'
    },
    'admin.compClose': {
      title: 'Close',
      body: 'Closes the form. Unsaved changes are dropped.'
    },
    'admin.groupId': {
      title: 'Group id',
      body: 'A short id used in the data: lowercase letters, numbers, and hyphens, such as 1 or plate. It is not the name players see.'
    },
    'admin.groupOrder': {
      title: 'Group order',
      body: 'Where this group sits compared with the others. Lower numbers come first on the leagues page and in filters.'
    },
    'admin.groupName': {
      title: 'Display name',
      body: 'The name people see, such as Group 1. It can differ from the group id.'
    },
    'admin.groupPlayers': {
      title: 'Players in this group',
      body: 'Tick who belongs in this group. Someone already in another group of this comp is not listed. Save Group stores the ticks. A group should have at least two players.'
    },
    'admin.groupDelete': {
      title: 'Remove group',
      body: 'Removes this group from the competition. Players are not deleted; they just leave the group.'
    },
    'admin.groupCancel': {
      title: 'Cancel',
      body: 'Closes the group form without saving.'
    },
    'admin.groupSave': {
      title: 'Save group',
      body: 'Stores the id, name, order, and ticked players.'
    },

    'admin.addPlayer': {
      title: 'Add player',
      body: 'Opens a blank player. Set the name and save. Handicaps are added after the player exists.'
    },
    'admin.backPlayers': {
      title: 'Back to players',
      body: 'Returns to the player list without a further prompt. Save first if you changed the name.'
    },
    'admin.playerName': {
      title: 'Player name',
      body: 'The name shown on fixtures, results, standings, and handicaps.'
    },
    'admin.playerDelete': {
      title: 'Delete player',
      body: 'Deletes this player. You will be asked to confirm. Do this only when the player should no longer appear.'
    },
    'admin.playerCancel': {
      title: 'Cancel',
      body: 'Returns to the player list. A name you typed and did not save is dropped.'
    },
    'admin.playerSave': {
      title: 'Save player',
      body: 'Stores the name. Handicaps are saved from their own form underneath.'
    },
    'admin.addHandicap': {
      title: 'Add handicap',
      body: 'Opens the handicap form. Enter the number and the date it takes effect. The latest date is the current handicap. Older rows stay so past matches can show the handicap from that day.'
    },
    'admin.handicapValue': {
      title: 'Handicap',
      body: 'The handicap number that applies from the effective date until a later row replaces it.'
    },
    'admin.handicapDate': {
      title: 'Effective date',
      body: 'The first day this handicap applies. On a fixture, tapping a name uses the handicap whose date is on or before the match date.'
    },
    'admin.handicapCancel': {
      title: 'Cancel handicap',
      body: 'Closes the handicap form without saving.'
    },
    'admin.handicapSave': {
      title: 'Save handicap',
      body: 'Stores this handicap row. The list shows the newest date first, and that row is the current handicap.'
    },
    'admin.handicapRow': {
      title: 'Edit handicap',
      body: 'Opens this handicap so you can change the number or the date. This note is about the row, not about the value on it.'
    },
    'admin.handicapDelete': {
      title: 'Delete handicap',
      body: 'Removes this handicap row after you confirm. The player stays. If you delete the latest row, the previous date becomes current.'
    },
    'admin.playerComps': {
      title: 'Comps',
      body: 'Competitions this player is already on. It is a list, not a set of buttons. Rosters are changed from Manage Comps.'
    },

    'admin.fxComp': {
      title: 'Competition',
      body: 'Which competition’s fixtures you are editing. Changing it reloads the list. The warning beside it appears when the comp’s groups or rounds do not line up with the fixtures.'
    },
    'admin.addFixture': {
      title: 'Add fixture',
      body: 'Opens a blank match for this competition. Choose group or knockout, the week or round, best of, and the two players, then save.'
    },
    'admin.editFixture': {
      title: 'Edit fixture',
      body: 'Opens this match so you can change the players, week or round, or best of, or delete it. The V here edits the fixture. It does not enter the score. Scores are entered on the Fixtures and Results pages.'
    },
    'admin.fxStage': {
      title: 'Stage',
      body: 'Group matches use a group and a week number. Knockout matches use a round. Switching this shows the fields that apply.'
    },
    'admin.fxGroup': {
      title: 'Group',
      body: 'Which group this league match belongs to. The list comes from the competition’s groups.'
    },
    'admin.fxWeek': {
      title: 'Week',
      body: 'The game week number. Fixtures on the public page are grouped under this week.'
    },
    'admin.fxBestOf': {
      title: 'Best of',
      body: 'How many frames the match is played over: an odd number from 1 to 9. Best of 3 means the first player to 2 frames wins. The result form will not count frames past that.'
    },
    'admin.fxRound': {
      title: 'Round',
      body: 'The knockout round, such as quarter-final or semi-final. The bracket and the fixture list use this to place the match.'
    },
    'admin.fxPlayerA': {
      title: 'Player A',
      body: 'The first player. On the public list they appear on the left, and their frames are the first number in the score.'
    },
    'admin.fxPlayerB': {
      title: 'Player B',
      body: 'The second player. On the public list they appear on the right, and their frames are the second number in the score.'
    },
    'admin.fxSave': {
      title: 'Save fixture',
      body: 'Stores this match. It does not set a score. Enter the result later from Fixtures or Results.'
    },
    'admin.fxCancel': {
      title: 'Cancel',
      body: 'Closes the fixture form. Unsaved changes are dropped.'
    },
    'admin.fxDelete': {
      title: 'Delete fixture',
      body: 'Deletes this match. You will be asked to confirm. A result already entered on it goes with it.'
    },

    'admin.bulkFxComp': {
      title: 'Competition',
      body: 'The competition the pasted matches are added to.'
    },
    'admin.bulkFxGroup': {
      title: 'Group',
      body: 'The group those matches belong to. Every row in the box is imported into this group.'
    },
    'admin.bulkFxCsv': {
      title: 'Fixture rows',
      body: 'One match per line: week, player A, player B. For example: 1, Alice Smith, Bob Jones. Names must already exist as players. Import rows writes them as fixtures.'
    },
    'admin.bulkFxRun': {
      title: 'Import rows',
      body: 'Creates a fixture for each valid line. Lines that cannot be read are reported and skipped. You can run it again; check the message so you do not duplicate matches you already imported.'
    },
    'admin.bulkPlRoster': {
      title: 'Add to a roster',
      body: 'When ticked, each imported player is also placed on the competition and group chosen below. Leave it off to create players only.'
    },
    'admin.bulkPlComp': {
      title: 'Roster comp',
      body: 'The competition the imported players are added to, if “also add to roster” is ticked.'
    },
    'admin.bulkPlGroup': {
      title: 'Roster group',
      body: 'The group they join in that competition. Ignored when the roster tick is off.'
    },
    'admin.bulkPlCsv': {
      title: 'Player rows',
      body: 'One player per line: name, then an optional handicap and the date it starts. For example: Jane Doe, 42, 2025-09-01. A line with only a name creates the player with no handicap.'
    },
    'admin.bulkPlRun': {
      title: 'Import rows',
      body: 'Creates each player and, when you asked for it, adds them to the roster. Existing names are matched rather than duplicated where the import can tell. Read the message for any line that failed.'
    },

    'admin.acNote': {
      title: 'Code note',
      body: 'An optional reminder of who the code is for, such as a name. It is shown on the unused-codes list. It is not the code itself and the player does not have to type it.'
    },
    'admin.acIssue': {
      title: 'Issue code',
      body: 'Creates a one-time registration code, valid for 30 days. It is shown once so you can copy or share it. After that only the note remains on the unused list, not the code.'
    },
    'admin.acCode': {
      title: 'New code',
      body: 'The code that was just issued. Copy or share it now. It cannot be looked up again. The player types it on Register, then chooses a handle and password.'
    },
    'admin.copyCode': {
      title: 'Copy code',
      body: 'Copies the code to the clipboard so you can paste it into a message.'
    },
    'admin.shareCode': {
      title: 'Share code',
      body: 'Opens the device share sheet with the code, when the browser allows it. The code is still shown only this once.'
    },
    'admin.revokeCode': {
      title: 'Revoke code',
      body: 'Cancels this unused registration or reset code so it cannot be used. You will be asked to confirm.'
    },
    'admin.accountRow': {
      title: 'An account',
      body: 'Opens that player’s account: make them an admin, issue a password reset, or disable the account. This note is about the row, not about the handle on it.'
    },
    'admin.acClose': {
      title: 'Close account',
      body: 'Closes the account panel. A reset code you have not copied is not shown again.'
    },
    'admin.acToggleAdmin': {
      title: 'Admin flag',
      body: 'Makes this account an admin, or removes that if they already are. An admin who is signed in sees the manage pages without typing the admin secret. The button label shows the change it will make.'
    },
    'admin.acReset': {
      title: 'Password reset',
      body: 'Issues a one-time reset code for this handle, valid for 24 hours. It is shown once. The player uses it on Forgot password together with a new password. It does not reveal their current password.'
    },
    'admin.acDisable': {
      title: 'Disable account',
      body: 'Stops this account from signing in. The player record in the league stays. You can come back to this panel if the button offers to enable it again.'
    },

    'admin.gate': {
      title: 'Admin lock',
      body: 'This page stays closed until Admin Mode is unlocked from the menu, or you are signed in as an admin account.'
    }
  }
};
