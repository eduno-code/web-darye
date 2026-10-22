-- ============================================================
-- LAS TAREAS DE MANTENIMIENTO, TODAS Y EN EL REPOSITORIO
--
-- El proyecto tiene tres funciones de mantenimiento escritas y correctas. Una
-- ya se ejecuta sola; las otras dos no las llama nadie.
--
-- LO QUE YA FUNCIONABA: refrescar_tasa() tiene su tarea creada y la tasa del
-- BCV está al día. Pero esa tarea se creó A MANO, fuera de las migraciones, así
-- que el repositorio no la menciona y quien lea este proyecto de cero concluirá
-- —como se concluyó al escribir esta migración— que la tasa lleva semanas
-- congelada. Se declara aquí para que deje de ser un secreto de producción.
-- Se conserva su horario tal cual estaba, con el desfase de 17 minutos: no
-- empezar en la hora en punto reparte la carga en una infraestructura
-- compartida, y cambiarlo por un número más redondo sería empeorarlo por
-- estética.
--
-- LO QUE NO SE EJECUTA NUNCA:
--   · expire_holds()     las citas de prepago obligatorio llevan una hora de
--     plazo puesta a mano por create_booking, y ese plazo no se cumple jamás.
--     El hueco se queda ocupado por alguien que no pagó.
--   · expire_packages()  ningún bono caduca, así que los días de validez que
--     se venden no se aplican.
--
-- Nada de esto se ha notado porque la base está vacía. Se nota el día que entra
-- el primer paciente, que es exactamente el día en que peor se nota.
--
-- Se aprovecha para reparar un permiso perdido, explicado abajo. Esta migración
-- no crea tablas, no toca datos y no cambia ninguna función existente.
-- ============================================================


-- ---------- EL PROGRAMADOR ----------

-- Ya está instalada; la línea queda por si algún día se levanta el proyecto de
-- cero. pg_cron corre DENTRO de Postgres: no depende de que nadie abra la
-- página ni de un servicio externo que haya que pagar y vigilar aparte.
create extension if not exists pg_cron;


-- Volver a aplicar esta migración no debe duplicar las tareas. Se borran por
-- nombre antes de crearlas; si no existen, esto no hace nada y no falla.
select cron.unschedule(jobid)
  from cron.job
 where jobname in ('tasa-bcv', 'liberar-huecos', 'caducar-paquetes');


-- ---------- LA TASA DEL BCV ----------

-- OJO CON LA HORA: el reloj de pg_cron va en UTC, no en la zona de Daryeli.
-- Venezuela es UTC-4, así que a lo de aquí hay que restarle cuatro horas para
-- pensarlo en su hora.
--
-- Cada tres horas y no una vez al día. La diferencia importa: con un solo
-- intento diario, que la fuente esté caída justo en ese minuto significa
-- veinticuatro horas más con la tasa vieja. Con ocho intentos basta que uno
-- responda. Y cuesta poco: una petición HTTP y dos filas actualizadas.
--
-- Que la función se guarde la tasa anterior cuando la fuente falla es lo que
-- hace seguro repetirla tanto: un intento fallido no empeora nada.
select cron.schedule(
  'tasa-bcv',
  '17 */3 * * *',
  $job$ select app.refrescar_tasa(); $job$
);


-- ---------- LIBERAR LOS HUECOS DE PREPAGO SIN PAGAR ----------

-- Cada cinco minutos, y aquí la frecuencia sí es la parte importante. Al otro
-- lado hay una persona mirando la pantalla: eligió un horario, se le ocupó
-- mientras dudaba, y espera a que vuelva a estar libre. Una hora de retraso en
-- liberarlo es una reserva perdida. Cinco minutos son un mal rato corto.
--
-- Se puede repetir sin miedo: la función solo mira las citas cuya retención ya
-- venció, así que la inmensa mayoría de las veces no encuentra ninguna y no
-- escribe nada.
--
-- Y OJO CON LO QUE ESTO NO HACE, porque es fácil leerlo al revés. La retención
-- general está apagada a propósito: hold_minutes vale 0 desde 20260826130000,
-- decisión de Edgar, y con 0 las citas nacen con hold_expires_at en NULL, que
-- expire_holds ignora. Una cita normal sin pagar seguirá bloqueando su hueco
-- indefinidamente, igual que hasta ahora, y eso es lo acordado.
--
-- Lo único que esta tarea libera son las citas de PREPAGO OBLIGATORIO, a las
-- que create_booking les pone a mano una hora de plazo. Ese plazo se escribió
-- para que se cumpliera y hoy no se cumple nunca. Programar la tarea no
-- reactiva la retención que se quitó: hace efectiva la que sí se quiso poner.
select cron.schedule(
  'liberar-huecos',
  '*/5 * * * *',
  $job$ select app.expire_holds(); $job$
);


-- ---------- CADUCAR LOS BONOS ----------

-- Una vez al día basta: la validez de un bono se cuenta en días, no en minutos,
-- y a nadie le cambia la vida que caduque a las 00:15 o a las 09:00. Se pone de
-- madrugada en Venezuela (04:15 UTC) por costumbre sana: el mantenimiento va
-- cuando no hay nadie usando el sistema.
select cron.schedule(
  'caducar-paquetes',
  '15 4 * * *',
  $job$ select app.expire_packages(); $job$
);


-- ---------- EL PERMISO QUE SE PERDIÓ ----------

-- 20260826160000 cambió la firma de create_booking, y para no dejar colgando la
-- versión vieja hizo un revoke en bloque de TODAS las funciones del esquema
-- antes de volver a concederlas una por una. Se volvieron a conceder once.
-- verify_payment se quedó fuera de esa lista.
--
-- Consecuencia, comprobada en producción: Daryeli no puede aprobar ni rechazar
-- un comprobante. Le responde "permiso denegado". No lo ha visto nadie porque
-- el panel de administración todavía no existe, pero el fallo está vivo desde
-- el 26 de agosto y habría aparecido el primer día que lo abriera.
--
-- Se concede a `authenticated` y no a un rol de administración porque no hay
-- tal rol: quién es administrador lo decide la propia función preguntando por
-- app.is_admin(), y a quien no lo sea le devuelve 'forbidden'. Poder llamarla no
-- es poder usarla.
grant execute on function public.verify_payment(uuid, boolean, text) to authenticated;


-- ---------- PONER AL DÍA LO QUE ESTÉ ATRASADO ----------

-- Programar las tareas solo arregla el futuro. Las dos que nunca han corrido se
-- ejecutan una vez aquí mismo para que no haya que esperar al primer disparo.
select app.expire_holds();
select app.expire_packages();
