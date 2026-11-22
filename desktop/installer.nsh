!define MUI_DIRECTORYPAGE_TEXT_TOP "$(ProjiSpaceDirectoryText)"

!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TEXT "$(ProjiSpaceWelcomeText)"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customHeader
  LangString ProjiSpaceWelcomeText 1033 "Install ProjiSpace on this computer.$\r$\n$\r$\nChoose who can use the app, then select its installation folder.$\r$\n$\r$\nClose ProjiSpace before continuing."
  LangString ProjiSpaceWelcomeText 1049 "Установите ProjiSpace на этот компьютер.$\r$\n$\r$\nВыберите, кому будет доступна программа, затем укажите папку установки.$\r$\n$\r$\nПеред продолжением закройте ProjiSpace."
  LangString ProjiSpaceDirectoryText 1033 "Choose where to install the app. Use Browse to select another folder.$\r$\n$\r$\nThe project data folder is managed separately in ProjiSpace settings."
  LangString ProjiSpaceDirectoryText 1049 "Выберите папку для программы. Чтобы изменить её, нажмите «Обзор».$\r$\n$\r$\nПапка данных проектов выбирается отдельно в настройках ProjiSpace."
!macroend
