import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sqlitePackage = fileURLToPath(
  new URL('./node_modules/better-sqlite3', import.meta.url),
);

const config = {
  packagerConfig: {
    asar: { unpack: '**/*.node' },
  },
  hooks: {
    packageAfterCopy: async (
      _config,
      directory,
      _electronVersion,
      platform,
      arch,
    ) => {
      const target = path.join(directory, 'node_modules', 'better-sqlite3');
      await mkdir(path.join(target, 'prebuilds'), { recursive: true });
      for (const entry of [
        'package.json',
        'LICENSE',
        'lib',
        path.join('prebuilds', platform + '-' + arch + '.node'),
      ]) {
        await cp(path.join(sqlitePackage, entry), path.join(target, entry), {
          recursive: true,
        });
      }
    },
  },
  rebuildConfig: {
    ignoreModules: ['better-sqlite3'],
  },
  makers: [
    new MakerSquirrel({}),
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.js',
          config: 'vite.main.config.mjs',
          target: 'main',
        },
        {
          entry: 'src/preload.js',
          config: 'vite.preload.config.mjs',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
