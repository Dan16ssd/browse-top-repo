<p align="center"><img src="docs/logo.svg" width="112" alt="Logo de btr: una lupa sobre una estrella"></p>
<h1 align="center">browse-top-repo (<code>btr</code>)</h1>
<p align="center"><a href="README.md">English</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.ja.md">日本語</a> · <b>Español</b></p>

Antes de que un agente empiece una tarea, `btr` busca en GitHub skills de agente (`SKILL.md`) que encajen con
la tarea, puntúa los mejores repositorios, los analiza en busca de contenido peligroso e instala el ganador en
Claude Code, Codex, Gemini CLI, OpenCode o la carpeta compartida `~/.agents/skills`. `btr update` trae las
nuevas versiones publicadas.

Sin dependencias; Node 18+.

> Esta es una traducción; la versión de referencia es el [README en inglés](README.md).

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/hero-dark.png">
  <img alt="btr: explorador de skills para agentes de programación" src="docs/images/hero-light.png">
</picture>

**Vídeo de reseña (1 min 47 s, narrado y subtitulado en inglés):** [16:9](docs/btr-review.mp4) · [9:16 para TikTok / Reels / Shorts](docs/btr-review-vertical.mp4) · subtítulos: [docs/btr-review.srt](docs/btr-review.srt)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/demo-dark.png">
  <img alt="Salida de btr plan para una tarea de ingeniería inversa de Android" src="docs/images/demo-light.png">
</picture>

```sh
npm link                      # deja `btr` disponible globalmente (o ejecuta node bin/btr.js)
btr self-install              # enseña a tus agentes a usar btr antes de empezar

btr plan "reverse engineer an android apk"
btr eval trailofbits/skills "security audit"
btr install cloudflare/security-audit-skill
btr install anthropics/skills --skill pdf --agent claude --scope project
btr auto "pentest my web app"  # plan + instala la mejor opción (pregunta antes)
btr update --check && btr update
btr list
btr remove security-audit
```

Escribe la tarea en inglés: `btr` busca por palabras clave en inglés y casi todas las skills de GitHub están en
inglés. Con `/btr` en Claude Code puedes escribir en español; Claude traduce la tarea al inglés antes de buscar.

### En Claude Code: `/btr`

`btr self-install` también añade el comando `/btr` a Claude Code:

```text
/btr make an animated explainer video with remotion   # plan, muestra el top 3, pregunta, instala
/btr list
/btr update                                           # muestra los cambios y pregunta antes de actualizar
/btr remove remotion-best-practices
```

Claude ejecuta el plan, muestra las mejores opciones con su puntuación y hallazgos, y solo instala cuando dices que sí.

## Cómo se eligen las skills para una tarea

1. **Clasificar** la tarea en dominios (ingeniería inversa, seguridad, móvil, frontend, backend, devops,
   datos, ml, testing, documentos) por palabras clave; edita `DOMAINS` en `src/plan.js` para añadir más.
2. **Descubrir** candidatos con la búsqueda de repositorios de GitHub (`<dominio> claude skill`,
   `<dominio> agent skills`) y, con autenticación, la búsqueda de código `filename:SKILL.md <dominio>`.
   Las palabras que parecen el nombre de una herramienta (`remotion`, `ghidra`, `playwright`) tienen su
   propia búsqueda, y `btr` también revisa la organización de GitHub de esa herramienta, así que encuentra
   skills oficiales como `remotion-dev/skills` aunque su descripción no nombre la herramienta.
3. **Preseleccionar** por estrellas y coincidencia con la descripción, y después **evaluar** los primeros
   `--top` (8 por defecto) leyendo su árbol de archivos y el encabezado de cada `SKILL.md`.
4. **Puntuar** de 0 a 100:

   | parte | peso | se mide por |
   |---|---|---|
   | popularidad | 30 | logaritmo de las estrellas |
   | relevancia | 25 | términos de la tarea en nombre/descripción/temas del repo y en la descripción de cada skill |
   | skills | 20 | tiene SKILL.md, y cuántos tienen `name` + `description` |
   | actualidad | 15 | se reduce a la mitad cada 180 días desde el último push |
   | salud | 10 | licencia, no archivado, issues abiertos frente a estrellas |
   | oficial | +10 | publicado por la propia organización de la herramienta (p. ej. `remotion-dev` para Remotion) |
   | penalizaciones | | -40 contenido de riesgo alto, -10 medio, -5 por cada señal de confianza (p. ej. más de 2000 estrellas en menos de 90 días, casi sin forks), -15 plataforma equivocada |

5. En repositorios con muchas skills solo se sugieren las relevantes para la tarea.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scoring-dark.png">
  <img alt="Pesos de la puntuación y penalizaciones" src="docs/images/scoring-light.png">
</picture>

## Seguridad

Las skills son instrucciones y scripts que tu agente ejecuta con tus permisos. Antes de escribir nada, cada
archivo descargado se analiza en busca de: descargar y ejecutar (`curl | sh`, `iex`), cargas codificadas,
`rm -rf ~`, lectura de archivos de credenciales, inyección de prompts ("no se lo digas al usuario"),
desactivar las protecciones del agente, exfiltración de tokens, persistencia y binarios incluidos. Los
hallazgos de riesgo alto bloquean la instalación salvo que pases `--force`. Las actualizaciones se vuelven a
analizar. El analizador es heurístico: las skills de seguridad suelen mencionar rutas de credenciales de forma
legítima, y un análisis limpio no demuestra que una skill sea segura.

`btr` nunca sobrescribe una carpeta de skill que no haya creado, salvo con `--force`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/scanner-dark.png">
  <img alt="Skills bloqueadas por el analizador y falsos positivos corregidos" src="docs/images/scanner-light.png">
</picture>

## Agentes y rutas

| agente | ámbito de usuario | ámbito de proyecto |
|---|---|---|
| claude | `~/.claude/skills` | `.claude/skills` |
| codex | `~/.codex/skills` | `.agents/skills` |
| gemini | `~/.gemini/skills` | `.gemini/skills` |
| opencode | `~/.config/opencode/skill` | `.opencode/skill` |
| agents | `~/.agents/skills` | `.agents/skills` |

Sin `--agent`, las skills se instalan en todos los agentes cuya carpeta de configuración exista. Puedes
sobrescribir o añadir agentes en `~/.btr/agents.json`:

```json
{ "cursor": { "user": "~/.cursor/skills", "project": ".cursor/skills", "detect": "~/.cursor" } }
```

Las instalaciones se registran en `~/.btr/lock.json` (repo, ruta de la skill, ref, sha del commit, carpetas de destino).

## Autenticación

Usa `GITHUB_TOKEN` / `GH_TOKEN`, o `gh auth token` si la CLI de GitHub tiene sesión iniciada. Sin
autenticación funciona, pero omite la búsqueda de código y alcanza los límites de uso enseguida.

## Estado y benchmark

Versión temprana (v0.1). `npm run bench` ejecuta `plan` para 10 tareas contra GitHub real. El 2026-10-31 la
primera opción fue buena en 6 tareas, aceptable en 1 y desacertada en 3:

- Fuerte en tareas especializadas: ingeniería inversa de Android, auditoría de seguridad web, CTF, e2e con
  Playwright, diseño de UI, pandas.
- Débil en tareas amplias, donde gana un repo popular con una skill poco relacionada: el despliegue en
  Kubernetes eligió `kubeshark`, para PDF no encontró `anthropics/skills` y para iOS eligió una herramienta de
  testing móvil. En estos casos revisa la salida de `btr plan` antes de usar `btr auto`.
- Un plan tarda 3-6 s. Si ejecutas muchos seguidos se alcanza el límite de búsqueda de GitHub (30/min); `btr`
  espera, por eso la serie de 10 tareas promedió 12,4 s.
- Nombrar la herramienta ayuda: "... using remotion" encuentra el repositorio oficial `remotion-dev/skills` y lo pone primero.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/benchmark-dark.png">
  <img alt="Benchmark de 10 tareas reales" src="docs/images/benchmark-light.png">
</picture>

Limitaciones conocidas: los servidores MCP (p. ej. REA) se descubren pero no se registran; las rutas de skills
de Codex/Gemini/OpenCode son estimaciones y se pueden sobrescribir en `~/.btr/agents.json`.

## Vídeo

`video/` es un proyecto de [Remotion](https://www.remotion.dev) que genera el vídeo de reseña. La voz se crea
con edge-tts y faster-whisper la transcribe para que los subtítulos coincidan con lo que se dice.

```sh
cd video && npm install
npm run voice            # narration.json -> narration.mp3, línea de tiempo, subtítulos por palabra, .srt
npm run render           # -> out/btr-review.mp4 (1920x1080)
npm run render:vertical  # -> out/btr-review-vertical.mp4 (1080x1920, subtítulos fuera de la interfaz de la app)
```

## Tests

```sh
npm test        # sin conexión: parseo, puntuación, analizador, instalar/actualizar/eliminar en un home temporal
npm run bench   # benchmark contra GitHub real
```
