-- ============================================================
-- MARCHA ATRÁS de 20260907120000_tareas_programadas.sql
--
-- No es una migración: es un archivo suelto para pegar en el editor SQL si
-- hiciera falta deshacer. No vive en migrations/ porque el CLI lo aplicaría
-- como un paso más hacia adelante.
--
-- Deshacer las tareas devuelve el sistema al estado roto de antes —la tasa
-- congelada y los huecos bloqueados—, así que esto es para una emergencia,
-- no para una duda. Si lo que molesta es la frecuencia de una tarea, es mejor
-- reprogramarla con cron.schedule usando su mismo nombre, que la sustituye.
--
-- El permiso de verify_payment NO se retira aquí a propósito: no formaba
-- parte de esta migración más que por oportunidad, y quitarlo volvería a
-- dejar a Daryeli sin poder verificar pagos, que era el fallo original.
-- ============================================================

select cron.unschedule(jobid)
  from cron.job
 where jobname in ('tasa-bcv', 'liberar-huecos', 'caducar-paquetes');
