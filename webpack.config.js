const path = require("path");
const webpack = require("webpack");
const DtsBundlePlugin = require('webpack-dts-bundle').default;

module.exports = {
    entry: {
        "integration": "./src/int.ts",
        "wrapper": "./src/wrapper/wrapper.ts",
        "zig": "./src/zig/zig.ts",
        "debug-page": "./src/debug-page/debug-page.tsx",
    },

    output: {
        filename: './[name].min.js',
        path: path.resolve(__dirname, "dist/js"),
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"]
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
        }),
        new DtsBundlePlugin({
            name: 'integration',
            main: path.resolve(__dirname, './dist/js/src/int.d.ts'),
            out: path.resolve(__dirname, './dist/js/integration.d.ts'),
            verbose: true,
        }),
    ],

    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: "ts-loader",
            },
            {
                test: /\.css$/,
                loader: 'css-loader',
                options: {
                    minimize: true,
                }
            }
        ]
    }
};
