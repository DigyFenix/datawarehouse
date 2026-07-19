# Rollbacks del metadata-store

Un archivo `*_down.sql` por cada DDL forward de `../schema/`. Aplicar en **orden inverso** al de
creación (mayor a menor prefijo) para respetar dependencias (FKs):

```bash
for f in $(ls -r *_down.sql); do psql ... -f "$f"; done
```

Estos scripts **no** se ejecutan en el arranque de Docker (solo `../schema/` y `../seeds/`).
Son para revertir manualmente una migración (evolución de schema Nivel 2, CLAUDE.md §6).
