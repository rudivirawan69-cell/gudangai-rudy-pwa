
# 1. Clone atau buka repo
cd gudangai-rudy-pwa
git pull origin main

# 2. Ganti kedua file dengan isi dari RESTORE_GUDANGAI_OCR.zip
#    (RESTORE_pdfValidate.js → src/data/pdfValidate.js)
#    (RESTORE_InputPage.jsx → src/pages/InputPage.jsx)

# 3. Commit dan push
git add src/data/pdfValidate.js src/pages/InputPage.jsx
git commit -m "fix(ocr): restore gallery photo OCR quality filter and review label"
git push origin main
