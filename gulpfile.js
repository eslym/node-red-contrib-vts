const gulp = require('gulp');
const clean = require('gulp-clean');
const ts = require('gulp-typescript');
const Handlebars = require('handlebars');
const fs = require('fs');
const path = require('path');
const through = require("through2");
const gutil = require("gulp-util");
const json5 = require('json5');

//region Prepare Gulp
fs.readdirSync(path.join(__dirname, 'partials')).forEach((filename)=>{
    let name = path.basename(filename, '.hbs');
    Handlebars.registerPartial(name, fs.readFileSync(path.join(__dirname, 'partials', filename)).toString('utf-8'));
});
Handlebars.registerHelper('json', (obj)=>new Handlebars.SafeString(JSON.stringify(obj)));
const handlebars = through.obj(function (file, enc, cb) {
    if (file.isNull()) {
        this.push(file);
        return cb();
    }

    if (file.isStream()) {
        this.emit(
            'error',
            new gutil.PluginError('gulp-handlebars-render', 'Streaming not supported')
        );
    }

    let template = Handlebars.compile(file.contents.toString());

    let context = {
        filename: path.basename(file.path),
        basename: path.basename(file.path, '.hbs'),
    };
    let data = gutil.replaceExtension(file.path, '.json5');
    if(fs.existsSync(data)){
        context.data = json5.parse(fs.readFileSync(data).toString('utf-8'));
    }

    file.contents = Buffer.from(template(context));
    file.path = gutil.replaceExtension(file.path, '.html');

    this.push(file);
    cb();
});
//endregion

gulp.task('build-js', function(){
    let proj = ts.createProject('./tsconfig.json');
    return proj.src()
        .pipe(proj())
        .js
        .pipe(gulp.dest('dist'));
});

gulp.task('build-dts', function(){
    let proj = ts.createProject('./tsconfig.json');
    return proj.src()
        .pipe(proj())
        .dts
        .pipe(gulp.dest('dist'));
});

gulp.task('update-nodes', function (cb){
    let nodes = {};
    fs.readdirSync(path.join(__dirname, 'src')).forEach((f)=>{
        if(path.extname(f) === '.hbs'){
            let node = path.basename(f, '.hbs');
            nodes[node] = `dist/${node}.js`
        }
    });
    let pack = JSON.parse(fs.readFileSync('package.json').toString('utf-8'));
    if(!pack.hasOwnProperty('node-red')) pack['node-red'] = {};
    pack['node-red']['nodes'] = nodes;
    fs.writeFileSync('package.json', JSON.stringify(pack, null, 2));
    cb();
});

gulp.task('build-html', function (){
    return gulp.src('src/**/*.hbs')
        .pipe(handlebars)
        .pipe(gulp.dest('dist'));
});

gulp.task('copy-icons', function (){
    return gulp.src('src/icons/*.png')
        .pipe(gulp.dest('dist/icons'));
});

gulp.task('clean', function () {
    return gulp.src(['dist'], {read: false, allowEmpty:true})
        .pipe(clean());
});

gulp.task('build', gulp.parallel('build-js', 'build-dts', 'build-html', 'copy-icons', 'update-nodes'));

gulp.task('clean-build', gulp.series('clean', 'build'));
