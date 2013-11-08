"use strict";

var path = require('path');

function shellLog(err, stdout, stderr, cb) {

    if (err) {
        console.log(stdout);
        console.log(stderr);
        console.log(err);
        throw new Error(err);
    }
}

module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        shell: {
            npm_install: {
                command: [
                    'cd app',
                    'npm install'
                ].join('&&'),

                options: {
                    callback: shellLog
                }
            },
            pack_windows: {
                command: [
                    'cd bin',
                    '7z.exe a -r app.zip ..\\app\\* > zip.log',
                    'copy /b nw.exe+app.zip app.exe',
                    'del zip.log',
                    'del app.zip',
                    'move /Y app.exe ..\\output',
                    'copy /Y *.dll ..\\output',
                    'copy /Y *.pak ..\\output'
                ].join('&&'),
                options: {
                    callback: shellLog
                }
            },
            pack_linux: {
                command: [
                    '(cd app;zip ../app.zip -r * >../zip.log)',
                    'cat `which nw` app.zip >app.bin',
                    'rm zip.log',
                    'rm app.zip',
                    'cp `which nw`.pak output',
                    'chmod +x app.bin',
                    'mv app.bin output'
                ].join('&&'),
                options: {
                    callback: shellLog
                }
            },
            pack_unix: {
                command: [
                    'cd app',
                    'zip -qr ../output/app.nw .'
                ].join('&&'),
                options: {
                    callback: shellLog
                }
            },
            launch_windows: {
                command: [
                    'bin\\nw.exe app --config=config.json'
                ],
                options: {
                    callback: shellLog
                }
            },
            launch_unix: {
                command: [
                    'open -n -a node-webkit ./app'
                ].join('&&'),
                options: {
                    callback: shellLog
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-shell');

    grunt.registerTask('default', ['shell:npm_install']);

    if (process.platform === 'win32') {
        grunt.registerTask('pack', ['shell:pack_windows']);
        grunt.registerTask('run', ['shell:launch_windows']);
    } else if (process.platform === 'linux') {
        grunt.registerTask('pack', ['shell:pack_linux']);
        grunt.registerTask('run', ['shell:launch_linux']);
    } else {
        grunt.registerTask('run', ['shell:pack_unix']);
        grunt.registerTask('run', ['shell:launch_unix']);
    }
};
