import {expect} from "chai";
import "mocha";
import {appendGameConfigToURL, parseGameConfigFromURL} from "./config";

describe("parseGameConfigFromURL function", () => {

    it("should parse a valid config url", () => {
        const config = parseGameConfigFromURL("https://example.com/page.html#config=eyJjYW5vbmljYWxHYW1lTmFtZSI6ImNyb3Nzd29yZCJ9")
        expect(config).to.be.a("object");
        expect(config.canonicalGameName).to.equal("crossword");
    });

    it("should fail if no config parameter found", () => {
        expect(() => parseGameConfigFromURL("https://example.com/page.html")).to.throw();
    });
});

describe("appendGameConfigToURL function", () => {
    it('should serialize and append the config', function () {
        const result = appendGameConfigToURL("https://example.com", {canonicalGameName: "crossword"});
        expect(result).to.equal("https://example.com#config=eyJjYW5vbmljYWxHYW1lTmFtZSI6ImNyb3Nzd29yZCJ9")
    });

    it('should respect other hash parameters', function () {
        const result = appendGameConfigToURL("https://example.com#a=b", {canonicalGameName: "crossword"});
        expect(result).to.equal("https://example.com#a=b&config=eyJjYW5vbmljYWxHYW1lTmFtZSI6ImNyb3Nzd29yZCJ9")
    });
});