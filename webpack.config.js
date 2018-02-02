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

    module: {
        rules: [
            {
                test: /\.ts$/,
                loader: "ts-loader",
            }
        ]
    }
};
