from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
import os

# Crear carpeta si no existe
os.makedirs('pdfs_prueba', exist_ok=True)

comprobantes = [
    {
        "archivo": "test-01-match-perfecto.pdf",
        "fecha": "15/09/2026", "monto": "42,300.00", "tipo": "abono",
        "referencia": "REF-OK-001", "cuenta": "0123456789", "banco": "BBVA",
        "beneficiario": "Cliente Ejemplo", "descripcion": "Pago factura TEST-OK-001"
    },
    {
        "archivo": "test-02-monto-no-coincide.pdf",
        "fecha": "16/09/2026", "monto": "12,800.00", "tipo": "cargo",
        "referencia": "REF-MONTO-001", "cuenta": "9876543210", "banco": "Santander",
        "beneficiario": "Proveedor XYZ", "descripcion": "Pago factura TEST-MONTO-001"
    },
    {
        "archivo": "test-03-fecha-fuera.pdf",
        "fecha": "05/09/2026", "monto": "18,750.00", "tipo": "abono",
        "referencia": "REF-FECHA-001", "cuenta": "0123456789", "banco": "BBVA",
        "beneficiario": "Cliente Ejemplo", "descripcion": "Pago tardio"
    },
    {
        "archivo": "test-04-referencia-no-encontrada.pdf",
        "fecha": "17/09/2026", "monto": "5,000.00", "tipo": "cargo",
        "referencia": "REF-INVENTADA-999", "cuenta": "5555555555", "banco": "Banorte",
        "beneficiario": "Proveedor Desconocido", "descripcion": "Pago sin factura"
    },
    {
        "archivo": "test-05-match-perfecto-grupo.pdf",
        "fecha": "18/09/2026", "monto": "80,000.00", "tipo": "abono",
        "referencia": "REF-OK-002", "cuenta": "1111111111", "banco": "Banorte",
        "beneficiario": "Cliente Industrial", "descripcion": "Cobro factura TEST-OK-002"
    },
    {
        "archivo": "test-06-monto-no-coincide-grupo.pdf",
        "fecha": "19/09/2026", "monto": "25,030.00", "tipo": "cargo",
        "referencia": "REF-MONTO-002", "cuenta": "1111111111", "banco": "Banorte",
        "beneficiario": "Proveedor de Servicios", "descripcion": "Pago parcial"
    },
    {
        "archivo": "test-07-sin-facturas.pdf",
        "fecha": "20/09/2026", "monto": "10,000.00", "tipo": "cargo",
        "referencia": "CUALQUIER-REF", "cuenta": "9999999999", "banco": "HSBC",
        "beneficiario": "Alguien", "descripcion": "Prueba"
    },
]

# Etiquetas a mostrar en el PDF (sin acentos en el diccionario, con acentos en el PDF)
etiquetas = {
    "fecha": "Fecha",
    "monto": "Monto",
    "tipo": "Tipo",
    "referencia": "Referencia",
    "cuenta": "Cuenta",
    "banco": "Banco",
    "beneficiario": "Beneficiario",
    "descripcion": "Descripción",
}

campos = ["fecha", "monto", "tipo", "referencia", "cuenta", "banco", "beneficiario", "descripcion"]

for c in comprobantes:
    path = os.path.join('pdfs_prueba', c["archivo"])
    cpdf = canvas.Canvas(path, pagesize=LETTER)
    cpdf.setFont("Helvetica-Bold", 16)
    cpdf.drawString(72, 720, "COMPROBANTE DE TRANSFERENCIA")
    cpdf.setFont("Helvetica", 12)

    y = 680
    for campo in campos:
        cpdf.drawString(72, y, f"{etiquetas[campo]}:")
        cpdf.drawString(220, y, c[campo])
        y -= 22

    cpdf.save()
    print(f"OK {c['archivo']}")

print("\nTodos los PDFs generados en ./pdfs_prueba/")