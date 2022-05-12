import { calcSvt, CalcVals, ChainCalcVals, EnemyCalcVals, cmdArgs, getNps } from "fgo-calc";
import { emoji, nicknames } from "../assets/assets";
import { getSvt } from "../helpers/svt";
import { getCardEmbeds, getChainEmbeds, getEnemyEmbeds } from "../helpers/embeds";
import { Message } from "discord.js";
import https from "https";
import { JSDOM } from "jsdom";
import { create, all } from "mathjs";
import fs from "fs";
import { ApiConnector, Entity, Language, Region } from "@atlasacademy/api-connector";

const math = create(all, {});
const apiConnector = new ApiConnector({ host: "https://api.atlasacademy.io", region: Region.JP, language: Language.ENGLISH });

const entityTypeDescriptions = new Map<Entity.EntityType, string>([
    [Entity.EntityType.NORMAL, "Servant"],
    [Entity.EntityType.HEROINE, "Servant (Mash)"],
    [Entity.EntityType.COMBINE_MATERIAL, "Exp Card"],
    [Entity.EntityType.ENEMY, "Enemy"],
    [Entity.EntityType.ENEMY_COLLECTION, "Enemy Servant"],
    [Entity.EntityType.ENEMY_COLLECTION_DETAIL, "Boss"],
    [Entity.EntityType.SERVANT_EQUIP, "Craft Essence"],
    [Entity.EntityType.STATUS_UP, "Fou Card"],
]);

function getNames(servant: string) {
    let title = `No matches found for ${servant}!`,
        description = "";

    if (+servant === +servant) {
        if (nicknames[servant] && nicknames[servant].length > 0) {
            title = `Nicknames for Servant #${servant}:`;
            description = nicknames[servant].join("\n");
        }
    } else {
        let id = Object.keys(nicknames).find((id) => nicknames[id].includes(servant))!;
        let names = nicknames[id];

        if (names) {
            title = `Nicknames for ${servant} (ID #${id}):`;
            description = names.join("\n");
        }
    }

    return {
        embeds: [
            {
                title,
                description,
            },
        ],
        name: "getnames",
    };
}

async function addName(str: string, message: Message) {
    let reply = "";

    if (process.env.AUTH_USERS!.includes(message.author.id)) {
        let [id, ...nicknameWords] = str.split(" ");

        const nickname = nicknameWords.join(" ");

        if (!(id in nicknames)) {
            nicknames[id] = [];
        }

        if (!nicknames[id].includes(nickname)) {
            nicknames[id].push(nickname);
            fs.writeFileSync("./src/assets/nicknames.json", JSON.stringify(nicknames, null, 2));
            reply = `Set ${id}: ${nickname}`;
            console.log(`Set ${id}: ${nickname}`);
        } else {
            reply = `[${id}: "${nickname}"] already exists!`;
        }
    }

    return reply;
}

async function test(args: string) {
    let argStr: string, svtName: string;

    svtName = args.split(" ")[0];
    argStr = args.split(" ").slice(1).join(" ");

    if (svtName === undefined) {
        return { content: "haha :WoahWheeze:" };
    }

    const svt = await getSvt(svtName);
    const resultFields = calcSvt(svt, argStr);

    switch (resultFields.type) {
        case "card":
            return getCardEmbeds(resultFields.vals as CalcVals);
        case "chain":
            return getChainEmbeds(resultFields.vals as ChainCalcVals);
        case "enemy":
            return getEnemyEmbeds(resultFields.vals as EnemyCalcVals);
    }
}

async function help(args: string, message: Message) {
    let cmds = cmdArgs().filter((arg) => arg.name === args.trim().toLowerCase());

    cmds = cmds.length ? cmds : cmdArgs();

    const parts = cmds.reduce((acc, curr) => {
        if (!acc[curr.type]) {
            acc[curr.type] = [];
        }
        acc[curr.type].push(curr);
        return acc;
    }, {} as { [key: string]: typeof cmds });

    const embedMessage = await message.channel.send({
        embeds: [
            {
                title: "__Arguments List__",
                description: [...parts["General"], ...parts["Command cards"]].reduce(
                    (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
                    ""
                ),
            },
        ],
        components: [
            {
                type: 1,
                components: [
                    { type: 2, label: "General", style: 2, customId: "general" },
                    { type: 2, label: "Shorthands", style: 2, customId: "shorthands" },
                    { type: 2, label: "Command Card Buffs", style: 2, customId: "cardArgs" },
                    { type: 2, label: "Non-offensive Buffs", style: 2, customId: "nonDmgArgs" },
                    { type: 2, label: "Aux", style: 2, customId: "auxMisc" },
                ],
            },
        ],
    });

    const collector = embedMessage.createMessageComponentCollector({
        filter: function filter(i) {
            if (i.user.id !== message.author.id) {
                i.reply({ content: "Please enter the command yourself to interact with it.", ephemeral: true });
                return false;
            }
            return true;
        },
        time: 300000,
    });

    collector.on("collect", async (interaction) => {
        let description = [...parts["General"], ...parts["Command cards"]].reduce(
            (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
            ""
        );

        switch (interaction.customId) {
            case "shorthands":
                description = parts["Shorthands"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                break;
            case "cardArgs":
                description = parts["Command card buffs"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                break;
            case "nonDmgArgs":
                description = parts["Non-offensive buffs"].reduce((acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`, "");
                break;
            case "auxMisc":
                description = [...parts["Aux"], ...parts["Misc"]].reduce(
                    (acc, curr) => acc + `**${curr.name}**: ${curr?.description}\n`,
                    ""
                );
                break;
        }

        await interaction.update({ embeds: [{ title: "__Arguments List__", description }] });
    });
}

async function listNPs(args: string) {
    const svt = await getSvt(args.split(" ")[0]);

    const NPs = getNps(svt);

    return {
        embeds: [
            {
                title: `NPs for ${svt.name}`,
                description:
                    NPs.reduce((str, NP, snp) => {
                        return NP.npMultis.length
                            ? (str += `${emoji(NP.card.toLowerCase())} \`snp${snp}\`:\n${NP.npMultis.reduce(
                                  (str, multi, index) => (str += `**NP${index + 1}**: *${multi.slice(0, -2) + multi[multi.length - 1]}*\n`),
                                  ""
                              )}\n`)
                            : "";
                    }, "").trim() || "No NPs found.",
            },
        ],
    };
}

function wikia(search: string) {
    let document: Document;

    return new Promise((resolve) => {
        https.get("https://www.google.com/search?q=site%3Afategrandorder.fandom.com+" + search.replace(/ /g, "+"), function (res: any) {
            let data = "";

            res.on("data", function (chunk: any) {
                data += chunk;
            });

            res.on("end", () => {
                document = new JSDOM(data, { pretendToBeVisual: true }).window.document;

                let reply = "";

                try {
                    reply =
                        "<" +
                        decodeURI(
                            decodeURI(
                                (
                                    document.querySelector('a[href^="/url?q=https://fategrandorder.fandom.com/wiki/"]') as HTMLAnchorElement
                                ).href
                                    .slice(7)
                                    .split("&")[0]
                            )
                        ) +
                        ">";
                    resolve(reply);
                } catch (err) {
                    resolve(
                        "Error finding result for <https://www.google.com/search?q=site%3Afategrandorder.fandom.com+" +
                            search.replace(/ /g, "+") +
                            ">"
                    );
                }
            });
        });
    });
}

async function db(search: string) {
    const entities = await apiConnector.searchEntity({ name: search });

    const URLs = entities.map((entity, entityNo) => {
        const text = `[(${entity.collectionNo === 0 ? entity.id : entity.collectionNo})${emoji(entity.className)}**${
            entity.name
        }** (${entityTypeDescriptions.get(entity.type)})]`;

        switch (entity.type) {
            case Entity.EntityType.NORMAL:
            case Entity.EntityType.HEROINE:
                return entity.collectionNo === 0
                    ? `${entityNo + 1}. ${text}(https://apps.atlasacademy.io/db/JP/enemy/${entity.id})`
                    : `${entityNo + 1}. ${text}(https://apps.atlasacademy.io/db/JP/servant/${entity.collectionNo})`;
            case Entity.EntityType.SERVANT_EQUIP:
                return `${entityNo + 1}. ${text}(https://apps.atlasacademy.io/db/JP/craft-essence/${entity.collectionNo})`;
            case Entity.EntityType.ENEMY:
            case Entity.EntityType.ENEMY_COLLECTION:
            case Entity.EntityType.ENEMY_COLLECTION_DETAIL:
                return `${entityNo + 1}. ${text}(https://apps.atlasacademy.io/db/JP/enemy/${entity.id})`;
        }
        return "";
    });

    return { embeds: [{ title: `Search results for query \`${search}\``, description: URLs.join(",\n") }] };
}

function lolwiki(search: string) {
    let document: Document;

    return new Promise((resolve) => {
        https.get("https://www.google.com/search?q=site%3Aleagueoflegends.fandom.com/+" + search.replace(/ /g, "+"), function (res: any) {
            let data = "";

            res.on("data", function (chunk: any) {
                data += chunk;
            });

            res.on("end", () => {
                document = new JSDOM(data, { pretendToBeVisual: true }).window.document;

                let reply = "";

                try {
                    reply =
                        "<" +
                        decodeURI(
                            decodeURI(
                                (
                                    document.querySelector(
                                        'a[href^="/url?q=https://leagueoflegends.fandom.com/wiki/"]'
                                    ) as HTMLAnchorElement
                                ).href
                                    .slice(7)
                                    .split("&")[0]
                            )
                        ) +
                        ">";
                    resolve(reply);
                } catch (err) {
                    resolve(
                        "Error finding result for <https://www.google.com/search?q=site%3Aleagueoflegends.fandom.com/+" +
                            search.replace(/ /g, "+") +
                            ">"
                    );
                }
            });
        });
    });
}

function bing(search: string) {
    let document: Document;

    return new Promise((resolve) => {
        https.get("https://www.bing.com/search?q=" + search.replace(/ /g, "+"), function (res: any) {
            let data = "";

            res.on("data", function (chunk: any) {
                data += chunk;
            });

            res.on("end", () => {
                ({ document } = new JSDOM(data, { pretendToBeVisual: true }).window);

                let reply = "";

                try {
                    reply =
                        "<" +
                        decodeURI(decodeURI((document.querySelector('main[aria-label="Search Results"] h2 a') as HTMLAnchorElement).href)) +
                        ">";
                    resolve(reply);
                } catch (err) {
                    resolve("Error finding result for <https://www.bing.com/search?q=" + search.replace(/ /g, "+") + ">");
                }
            });
        });
    });
}

async function calc(expr: string) {
    return math.evaluate(expr) + "";
}

const commands = new Map<string, Function>()
    .set("test", test)
    .set("t", test)
    .set("help", help)
    .set("h", help)
    .set("list", listNPs)
    .set("l", listNPs)
    .set("getnps", listNPs)
    .set("nps", listNPs)
    .set("wikia", wikia)
    .set("w", wikia)
    .set("lolwiki", lolwiki)
    .set("lw", lolwiki)
    .set("google", bing)
    .set("bing", bing)
    .set("search", bing)
    .set("s", bing)
    .set("calculate", calc)
    .set("calc", calc)
    .set("c", calc)
    .set("evaluate", calc)
    .set("eval", calc)
    .set("e", calc)
    .set("math", calc)
    .set("m", calc)
    .set("getnames", getNames)
    .set("names", getNames)
    .set("g", getNames)
    .set("addname", addName)
    .set("name", addName)
    .set("a", addName)
    .set("db", db)
    .set("aa", db)
    .set("chargers", () => "<https://apps.atlasacademy.io/chargers>")
    .set("starz", () => "<https://apps.atlasacademy.io/db/NA/servant/Mozart>")
    .set("refund", () => "https://imgur.com/lO1UGGU")
    .set("junao", () => ({
        embeds: [
            {
                title: "Junao/Waver",
                description: "https://imgur.com/IAYH9Vb",
            },
            {
                title: "Junao/Merlin",
                description: "https://imgur.com/eA0YLIQ",
            },
        ],
    }))
    .set("commands", () => {
        let replyDesc = `\\* test (t)		: test servant damage
		\\* chargers	: view chargers sheet
		\\* help (h)	: help for !test
		\\* getnames (g, names)	: get nicknames for a servant
		\\* getnps (list, l, nps)	: get nps for a servant
		\\* math(m)/calculate(calc, c)/evaluate(eval, e)	: evaluate mathematical expression
		\\* db (aa)	: search aa-db for entity, for instance to get the ID /C.No. to calc with
		\\* wikia (w)	: search F/GO wikia using google
		\\* google (bing, search, s)	: search query with bing
		\\* lolwiki (lw)	: search LoL wikia using google
		\\* junao	: bring up np1/np5 junao+waver|merlin calc
		\\* commands	: haha recursion
		\\* [no prefix needed in DMs]`;

        let reply = {
            embeds: [
                {
                    title: "__Commands__",
                    description: replyDesc,
                },
            ],
            name: "commands",
        };

        return reply;
    });

export { commands };
