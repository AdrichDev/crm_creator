# Spec ? Agenda OperaOS, Contactos, Telegram UI y Fichaje

## UC-1 ? Agenda/Citas con vista del widget principal
**DADO** que el usuario abre la secci?n `Agenda`, `Citas` o `Reservas`
**CUANDO** se renderiza el m?dulo
**ENTONCES** el sistema DEBE mostrar la misma vista visual del widget principal de agenda, adaptada a pantalla completa.

- AC-1.1 Deben conservarse vistas d?a/semana/mes, tarjetas, navegaci?n y detalle de cita.
- AC-1.2 La terminolog?a sectorial debe respetar `citas/reservas/clases` seg?n tenant.

## UC-2 ? CRUD en directo con calendario externo
**DADO** un tenant con Google Calendar conectado
**CUANDO** se crea, edita o cancela una cita
**ENTONCES** el evento remoto DEBE reflejar el mismo cambio sin esperar acci?n manual.

- AC-2.1 Google Calendar es obligatorio como proveedor inicial.
- AC-2.2 Outlook u otros proveedores DEBER?AN conectarse mediante puerto com?n.

## UC-3 ? Ubicaci?n con Google Maps
**DADO** una cita, cliente o visita con direcci?n
**CUANDO** el usuario solicita ver mapa o ubicaci?n
**ENTONCES** el sistema DEBE usar Google Maps, no el mapa actual.

- AC-3.1 Sin direcci?n, el bot?n o mapa debe quedar desactivado o en estado vac?o.

## UC-4 ? M?dulo Contactos
**DADO** un tenant con m?dulo `Contactos` activo
**CUANDO** el usuario entra en la secci?n
**ENTONCES** el sistema DEBE mostrar la misma experiencia visual y l?gica que Contactos de 3A Estudio/Agents Agency.

- AC-4.1 Debe incluir listado, detalle, estado/contactado y acciones equivalentes.
- AC-4.2 Debe integrarse en m?dulos, navegaci?n y generaci?n de tenants.

## UC-5 ? Telegram como UI operativa
**DADO** un bot Telegram conectado al tenant
**CUANDO** hay mensajes entrantes o respuestas manuales
**ENTONCES** OperaOS DEBE mostrar la conversaci?n en directo y permitir escribir desde la app.

- AC-5.1 Los mensajes deben persistirse con canal, direcci?n, autor y timestamp.
- AC-5.2 La respuesta manual no debe duplicar la respuesta autom?tica del bot.

## UC-6 ? Fichaje intensivo o partido
**DADO** un empleado en la secci?n `Fichaje`
**CUANDO** selecciona `Jornada intensiva` o `Jornada partida`
**ENTONCES** el sistema DEBE permitir solo la secuencia de fichajes v?lida para ese modo.

- AC-6.1 Intensiva: entrada y salida final.
- AC-6.2 Partida: entrada, salida antes de comer, entrada despu?s de comer y salida final.
- AC-6.3 No se deben crear fichajes m?ltiples arbitrarios el mismo d?a.

