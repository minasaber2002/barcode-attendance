# Barcode Logger

موقع static بسيط لتسجيل باركودات الحضور بالكاميرا وحفظ كل قراءة داخل المتصفح بتاريخ ووقت الاسكان، ثم تصديرها كملف Excel أو CSV.

## التشغيل المحلي

افتح `index.html` مباشرة، أو شغل سيرفر محلي:

```bash
python3 -m http.server 8000
```

ثم افتح:

```text
http://localhost:8000
```

## النشر على GitHub Pages

1. ارفع الملفات على GitHub في repository جديد.
2. من Settings > Pages اختار `Deploy from a branch`.
3. اختار branch `main` ومجلد `/root`.
4. افتح الرابط الذي سيظهر لك من GitHub Pages.

ملاحظة: الكاميرا تحتاج HTTPS، لذلك ستعمل على GitHub Pages. بعض المتصفحات تسمح بها أيضًا على `localhost`.
