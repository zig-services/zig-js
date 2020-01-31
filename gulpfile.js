const gulp = require('gulp');
const ts = require('gulp-typescript');
const sourcemaps = require('gulp-sourcemaps');
const rollup = require('gulp-better-rollup');
const resolve = require('@rollup/plugin-node-resolve');
const terser = require("gulp-terser");

function compileTypeScript(dest, opts) {
  const proj = ts.createProject('tsconfig.json', {...opts});

  return () =>
    gulp
      .src(proj.config.include)
      .pipe(sourcemaps.init())
      .pipe(proj())
      .pipe(sourcemaps.write())
      .pipe(gulp.dest(dest));
}

function bundleGulp(input) {
  return () => gulp.src(input)
    .pipe(rollup({treeshake: true, plugins: [resolve()]}, {
      name: "ZIG",
      format: "iife",
    }))
    .pipe(terser())
    .pipe(gulp.dest("./dist/bundles/"));
}

gulp.task(
  'build:esm2015',
  compileTypeScript('dist/esm2015', {
    target: 'es2015',
  }),
);

gulp.task(
  'build:esm5',
  compileTypeScript('dist/esm5', {
    target: 'es5',
    downlevelIteration: true,
  }),
);

gulp.task(
  'build:cjs',
  compileTypeScript('dist/cjs', {
    target: 'es5',
    module: 'commonjs',
    downlevelIteration: true,
  }),
);

gulp.task(
  'bundle:browser',
  gulp.parallel(
    bundleGulp("dist/esm5/libzig.js"),
    bundleGulp("dist/esm5/wrapper/wrapper.js"),
    bundleGulp("dist/esm5/debug-page/debug-page.js"),
  ));

gulp.task('default',
  gulp.series(
    gulp.parallel('build:cjs', 'build:esm5', 'build:esm2015'),
    'bundle:browser'));
