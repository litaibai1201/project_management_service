
@echo off
set /p value=<D:\Services\project_management_server\pid
echo %value%
taskkill /f /pid %value%