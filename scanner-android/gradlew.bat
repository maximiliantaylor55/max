@echo off
setlocal
set APP_HOME=%~dp0
set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar
if defined JAVA_HOME (
  set JAVA_EXE=%JAVA_HOME%\bin\java.exe
) else if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" (
  set JAVA_EXE=%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe
) else if exist "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe" (
  set JAVA_EXE=%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe
) else (
  set JAVA_EXE=java.exe
)
"%JAVA_EXE%" %JAVA_OPTS% %DEFAULT_JVM_OPTS% -Dorg.gradle.appname=gradlew -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
