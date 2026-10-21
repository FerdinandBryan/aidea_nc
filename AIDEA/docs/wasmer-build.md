# Wasmer build

Keep Wasmer's root directory set to `AIDEA`. The repository-root
`Anybuild.AIDEA` file is the build definition for that subdirectory.

The explicit source copy before Composer is intentional. In Anybuild 0.33.0,
overriding an install command replaces its run step without preserving its
`inputs`. Without the preceding copy, Composer runs in an empty `/app` and
reports that `composer.json` is missing.

The definition includes Node and npm because Wasmer can retain the Laravel
preset's `npm install` and `npm run build` command overrides. The backend's
package.json and Vite entry points are included in the source copy.

Validate the definition with the same Anybuild version used by Wasmer:

```sh
anybuild plan . --subdir AIDEA
anybuild plan . --subdir AIDEA --install-command 'composer install --optimize-autoloader --ignore-platform-reqs --no-scripts --no-interaction && npm install' --build-command 'php artisan package:discover --ansi'
```

Plan evaluation checks the definition, not a complete Docker/Wasmer build.
After a push, check the new deployment logs. They should say the existing
Anybuild definition is being used and show a source copy before Composer.
Do not upload the downloaded app YAML to fix this issue: it identifies the
previous runtime package rather than supplying the repository build steps.
