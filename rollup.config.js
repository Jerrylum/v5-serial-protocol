
// rollup.config.js
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
// import { terser } from 'rollup-plugin-terser';
import excludeDependenciesFromBundle from "rollup-plugin-exclude-dependencies-from-bundle";
import license from 'rollup-plugin-license'
import dts from 'rollup-plugin-dts';
import { version, main, module, author } from './package.json'

const name = "V5 Serial Protocol";

// const isProduction = process.env.NODE_ENV === 'production'

const settings = {
  globals: { },
  sourcemap: true,
}

const licenseConfig = license({
  banner: `
  ${name} v${version}
  Copyright 2022<%= moment().format('YYYY') > 2022 ? '-' + moment().format('YYYY') : null %> ${author}
`
});

export default [
  {
    input: './src/index.ts',
    output: [
      {
        file: module,
        ...settings,
        name: name,
        format: 'es'
      },
      {
        file: main,
        ...settings,
        name: name,
        format: 'cjs'
      }
    ],

    plugins: [
      json(),
      resolve({
        jsnext: true,
        main: true
      }),
      typescript({
        typescript: require('typescript')
      }),
      commonjs({
        include: 'node_modules/**',
        extensions: ['.js'],
        ignoreGlobal: false,
        sourceMap: true
      }),
      excludeDependenciesFromBundle({
        dependencies: true
      }),
      licenseConfig
    ]
  },
  {
    input: "dts/index.d.ts",
    output: [{ file: "index.d.ts", format: "es" }],
    plugins: [dts(), licenseConfig],
  },
]
