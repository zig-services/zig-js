const webpack = require("webpack");

module.exports = {
    entry: {
        "integration": "./src/integration/integration.ts",
        "wrapper": "./src/wrapper/wrapper.ts",
        "zig": "./src/zig/zig.ts",
        // "debug-page": "./src/debug-page/debug-page.tsx",
    },

    output: {
        filename: './[name].min.js',
    },

    resolve: {
        extensions: [".ts", ".tsx", ".js", ".jsx"]
    },

    plugins: [
        new webpack.DefinePlugin({
            VERSION: JSON.stringify(require("./package.json").version),
            BUILDTIME: JSON.stringify(Date.now()),
        })
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
