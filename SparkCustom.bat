# SparkCustom 실행 배치 파일 생성
@'
@echo off
cd /d "C:\Users\ROOT\Desktop\SparkCustom"
npx electron .
'@ | Out-File -Encoding ascii "C:\Users\ROOT\Desktop\SparkCustom.bat"

echo "SparkCustom.bat 생성 완료 - 바탕화면에서 더블클릭하면 실행됩니다"
