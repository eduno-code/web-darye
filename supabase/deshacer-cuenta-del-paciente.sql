-- ============================================================
-- MARCHA ATRÁS de 20260905130000_cuenta_del_paciente.sql
--
-- No es una migración: es un archivo suelto para pegar en el editor SQL si
-- hiciera falta deshacer. No vive en migrations/ porque el CLI lo aplicaría
-- como un paso más hacia adelante.
--
-- Que deshacer sea esto de corto es la mejor prueba de que la migración era
-- segura: solo creó dos funciones. No tocó ni una tabla, ni un dato, ni una
-- política de RLS, ni ninguna función que ya existiera.
-- ============================================================

drop function if exists public.mis_consultas();
drop function if exists app.mi_ficha();
