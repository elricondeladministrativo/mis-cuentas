# Mis Cuentas

App web (PWA) para controlar sueldo, gastos y deudas desde el celular.

- **Recibos:** cargás el PDF del recibo de sueldo (lectura exacta con pdf.js) o una foto (OCR con Tesseract.js, sin internet después de la primera vez). Antes de guardar se revisa todo y la app verifica que haberes − descuentos = líquido.
- **Deudas:** cuotas pagadas, lo que falta y cuándo terminás. Las que salen del sueldo suman la cuota solas al guardar el recibo de cada mes.
- **Gastos:** fijos (luz, gas, wifi…) y otros, por mes.
- **Resumen:** cuánto te queda en el mes después de gastos y cuotas.

Los datos quedan solo en el dispositivo (localStorage). Desde Resumen se baja/restaura una copia en JSON.

Probar en la PC: `python -m http.server 5192` dentro de esta carpeta y abrir http://localhost:5192
Íconos: `node make-icons.js`
