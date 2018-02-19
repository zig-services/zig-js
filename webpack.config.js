const webpack = require("webpack");

module.exports = {
    entry: {
        integration: "./integration/integration.ts",
        wrapper: "./wrapper/wrapper.ts",
        zig: "./zig/zig.ts",
    },

    output: {
        filename: './out/[name].min.js',
    },

    resolve: {
        extensions: [".ts"]
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
                test: /\.ts$/,
                loader: "ts-loader",
            }
        ]
    }
};
