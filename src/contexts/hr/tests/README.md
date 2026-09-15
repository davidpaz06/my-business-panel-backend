# Tests de integracion RRHH — Venezuela (LOTTT)

Tests `.http` del modulo de Recursos Humanos migrado a la **Ley Organica del Trabajo, los Trabajadores y las Trabajadoras** (Gaceta Oficial N 6.076 Extraordinario, 07-05-2012).

Cada archivo cubre un caso de uso con codigo estable `HR-VE-XX`, referenciado en el backlog, en los nombres de servicios y en el desglose de la liquidacion.

## Estado

Los endpoints que ejercitan estos archivos **todavia no existen**: la migracion de base de datos esta hecha (migraciones `hr/006` a `hr/018`), el backend no. Cada archivo indica en su cabecera a que fase del roadmap pertenece.

Sirven como especificacion ejecutable: definen la superficie de API esperada y los asserts que debe cumplir cada calculadora antes de darse por terminada.

## Datos de prueba

Los tests apuntan al tenant real **MEmpresa S.A.**:

| Variable | Valor |
| --- | --- |
| `@tenantId` | `a57174b6-c757-4bb9-bae2-ea4e7ffa6088` |
| `@branchId` | `8aa62c84-a07a-4ea5-a6df-523ab22089b0` (nueva sucu 3) |
| `@branchId2` | `98d4eb99-5354-485a-96cc-12c4785a3d01` (sucu 4) |
| `@turnId` | `3` |
| `@employeeId` | `e366b534-4320-42e6-a5db-6e9290cc4969` (Jose Carrasco) |
| `@contractId` | `78119672-ab56-4b29-acf2-fcf84674e9c9` |

**Cifras base** — salario 2000.00, jornada 8 h. Todos los montos esperados derivan de aqui:

```
salario_diario  = 2000 / 30       = 66.6667   (Art. 113)
valor_hora      = 66.6667 / 8     =  8.3333

alicuota_utilidades = (66.6667 * 30) / 360 =  5.5556
alicuota_bono_vacac = (66.6667 * 15) / 360 =  2.7778
salario_integral                            = 75.0000   (Art. 122)
```

### Hace falta un segundo empleado

Jose Carrasco ingreso el **2026-06-19**: unos 2 meses de antiguedad. Cae en la excepcion del Art. 142.e y **no sirve** para probar los escalonamientos por antiguedad (Arts. 142.b, 190, 192).

La FASE 0 de `00-setup.test.http` trae el SQL para crear un empleado con ingreso **2019-03-15** (7 anios). Su UUID va en `@employeeAntiguoId`, declarado en los archivos que lo necesitan: `hr-ve-05`, `hr-ve-11`, `hr-ve-12`, `hr-ve-13`.

Los tests de escalonamiento que consultan por query param (`?years=N`) no dependen de ningun empleado y corren tal cual.

## Orden de ejecucion

`00-setup.test.http` **siempre primero**. Crea el empleado con antiguedad y carga los parametros obligatorios (`tasa_activa_bcv`, `salario_minimo_nacional`). Los demas archivos asumen esas variables resueltas.

Los IDs que quedan como `00000000-...` son los que **crean los propios tests** (`@settlementId`, `@periodId`, `@depositId`, `@advanceId`, `@deductionId`, `@beneficiaryId`, `@profitPeriodId`): copiar el valor devuelto por el request que los genera.

| Archivo | Caso | Articulos | Fase |
| --- | --- | --- | --- |
| `00-setup` | Bootstrap, parametros, salario integral | 104, 113, 122, 129 | 1 |
| `hr-ve-01-jornada` | Limites de jornada | 173, 175, 176 | 2 |
| `hr-ve-02-bono-nocturno` | Recargo nocturno 30% | 117 | 2 |
| `hr-ve-03-horas-extra` | Extras 50%, topes, doble recargo | 118, 178, 182 | 2 |
| `hr-ve-04-feriados` | Feriado trabajado, descanso compensatorio | 120, 184, 188 | 2 |
| `hr-ve-05-prestaciones` | **Garantia vs retroactivo, MAX** | 142 | 2 |
| `hr-ve-06-intereses-garantia` | Intereses, penalizacion por no depositar | 143 | 2 |
| `hr-ve-07-mora` | Mora a tasa activa BCV | 128, 130, 141, 142.f | 2 |
| `hr-ve-08-anticipos` | Anticipo hasta 75% | 144 | 2 |
| `hr-ve-09-utilidades` | Reparto 15%, topes 30/120 dias | 131, 135, 136, 137 | 3 |
| `hr-ve-10-bonificacion-fin-anio` | Anticipo de diciembre | 132, 140 | 3 |
| `hr-ve-11-vacaciones` | Escalonamiento 15 a 30 dias | 121, 190 | 3 |
| `hr-ve-12-bono-vacacional` | Bono 15 a 30 dias | 192 | 3 |
| `hr-ve-13-vacaciones-fraccionadas` | Fracciones por meses completos | 195, 196 | 3 |
| `hr-ve-14-indemnizacion` | Despido injustificado (duplica) | 92 | 3 |
| `hr-ve-15-liquidacion` | Orquestacion completa | 51, 106, 142 | 3 |
| `hr-ve-16-herederos` | Reparto en partes iguales | 145 | 3 |
| `hr-ve-17-descuentos` | Topes 1/3 y 50% | 152, 154 | 3 |
| `hr-ve-18-cuotas-sindicales` | Autorizacion expresa | 412, 413 | 3 |

## Requisitos previos

1. Migraciones `hr/006` a `hr/018` aplicadas.
2. Seeds `hr/003` (feriados VE), `hr/004` (conceptos LOTTT) y `hr/006` (parametros LOTTT) cargados.
3. `npm run start:dev` corriendo en `http://localhost:3000`.
4. Los parametros `tasa_activa_bcv` y `salario_minimo_nacional` cargados por tenant (paso 3 y 4 del setup). No tienen valor sembrado por defecto: dependen de acto del BCV y decreto del Ejecutivo.

## Las dos areas de mayor riesgo

Concentrar la revision aqui:

**Excepciones por antiguedad** (`hr-ve-05`, `hr-ve-11`, `hr-ve-12`)
- Art. 142.b — los 2 dias por anio **no corren durante el primer anio**; tope 30 al anio 16.
- Art. 142.c — la fraccion redondea a anio completo **solo si supera** 6 meses. Exactamente 6 no redondea.
- Art. 142.e — menos de 3 meses sustituye por completo ambos esquemas (5 dias por mes o fraccion).
- Art. 190 / 192 — escalonamiento con topes distintos que convergen en 30 dias.

**Intereses por retraso** (`hr-ve-06`, `hr-ve-07`)
- Art. 143 — trimestre sin deposito dispara la tasa **activa** del BCV como penalizacion.
- Art. 142.f — mora desde el **dia 6** posterior al egreso.
- La tasa debe resolverse **vigente por tramo temporal**, nunca fija.

## Regla de oro del calculo

| Base salarial | Se usa para | Articulo |
| --- | --- | --- |
| **Salario normal** | Recargos, feriados, vacaciones, bono vacacional, utilidades | 104 |
| **Salario integral** | Prestaciones e indemnizaciones | 122 |

Nunca intercambiables. Es el error de calculo mas frecuente y varios asserts (`?explain=true`) existen precisamente para detectarlo.

## Hueco conocido

La especificacion de origen no cubre las **retenciones mensuales venezolanas** (IVSS, INCES, FAOV, Paro Forzoso, ISLR). Los conceptos estan sembrados en la plantilla pero **inactivos** y con `base_value = 0`.

Consecuencia: la corrida de nomina mensual produce un neto **sin deducciones legales**. Es correcto para desarrollo y para los calculos de prestaciones, vacaciones y utilidades, pero **no es liberable a produccion** sin una especificacion propia de retenciones.

## Aviso

Estos tests reflejan la interpretacion recogida en `MBP_Nomina_LOTTT_Venezuela.md`, que no constituye asesoria legal. Antes de liberar los calculos a produccion conviene validacion de un especialista en derecho laboral venezolano.
