import { ApiConnector, Enemy, Language, NoblePhantasm, Region, Servant } from "@atlasacademy/api-connector";
import { nicknames } from "../assets/assets";
import Fuse from "fuse.js";
import fetch from "node-fetch";
import { promises as fs } from "fs";

const apiConnector = new ApiConnector({
    host: "https://api.atlasacademy.io",
    region: Region.JP,
    language: Language.ENGLISH,
});

let servants: Servant.Servant[], bazettNP: NoblePhantasm.NoblePhantasm;
let fuseServants: Fuse<Servant.Servant>;

const downloadServants = () => {
    apiConnector
        .servantListNice()
        .then((svts) => {
            servants = svts;
            return fs.writeFile(__dirname + "/" + "../assets/nice_servants.json", JSON.stringify(servants));
        })
        .then(() => console.log("Servants updated."));
};

const loadServants = () => {
    return fs
        .readFile(__dirname + "/" + "../assets/nice_servants.json", { encoding: "utf8" })
        .then((data) => {
            servants = JSON.parse(data) as Servant.Servant[];
        })
        .then(() => console.log("Servants loaded."));
};

const checkHashMatch = () => {
    return Promise.all([
        fetch("https://api.atlasacademy.io/info").then(
            (response) => response.json() as Promise<{ [key in "JP" | "NA" | "CN" | "KR" | "TW"]: { hash: string; timestamp: number } }>
        ),
        fs.readFile(__dirname + "/" + "../assets/api-info.json", { encoding: "utf8" }),
    ]).then(([remoteInfo, localInfo]) => {
        fs.writeFile(__dirname + "/" + "../assets/api-info.json", JSON.stringify(remoteInfo));
        return !(remoteInfo.JP.hash === (JSON.parse(localInfo) as typeof remoteInfo).JP.hash);
    });
};

/**
 * Initialises servant list and Bazett's Fragarach NP
 */
const init = () => {
    console.log("Loading servants...");

    return new Promise<void>((resolve, reject) => {
        try {
            checkHashMatch()
                .then((shouldUpdateServants) => {
                    if (shouldUpdateServants) {
                        return downloadServants();
                    } else {
                        return loadServants();
                    }
                })
                .then(() => {
                    fuseServants = new Fuse<Servant.Servant>(servants, {
                        keys: ["name", "originalName", "id", "collectionNo"],
                        threshold: 0.4,
                    } as any);
                    return apiConnector.noblePhantasm(1001150);
                })
                .then((NP) => {
                    bazettNP = NP;
                });
            resolve();
        } catch (error) {
            reject(error);
        }
    });
};

/** Checks if a given entity is an enemy:
 * Enemies have `type: "enemy"` by definition, so to check if the given entity is an enemy, simply check that the type is "enemy"
 * @param entity Entity of type {@link Enemy.Enemy} | `{ detail: string }`, to be checked
 * @returns boolean: true if `entity.type === "enemy"`, false otherwise
 */
const isEnemy = (entity: Servant.Servant | Enemy.Enemy): entity is Enemy.Enemy => entity.type === "enemy";

/**
 * Get servant or enemy entity from servant collectionNo or enemy ID; rejects if invalid ID or collectionNo, or if any other error encountered
 * @param svtName The servant name, collectionNo or enemy ID to search
 * @returns Promise resolved with the entity matching the given name, collectionNo or ID; rejected if not found
 */
const getSvt = async (svtName: string): Promise<Servant.Servant | Enemy.Enemy> => {
    let svtId =
        +svtName === +svtName // svt is number?
            ? +svtName // if it's not a number, then it's a nickname, so fetch C.No. from nicknames
            : +Object.keys(nicknames).find((id) => nicknames[+id].includes(svtName))!; // If undefined then +undefined returns NaN

    svtId =
        svtId === svtId // svtId is not NaN?
            ? svtId // no change if not NaN
            : // if NaN, query api with svt name and fetch the ID of the enemy
              (
                  await ((await fetch(`https://api.atlasacademy.io/basic/JP/svt/search?name=${svtName}&lang=en`)).json() as Promise<
                      Enemy.Enemy[]
                  >)
              )?.filter((svt) => svt.type === "enemy")?.[0]?.id ??
              // If no such svt, set ID as NaN
              NaN;

    let svt: Servant.Servant | Enemy.Enemy | null;

    svt =
        svtId === svtId // If svtId has been resolved to a valid ID or C.No.
            ? servants.find((servant) => servant.collectionNo === svtId) ?? null
            : // If svtId has still not been resolved, try fuzzy searching with the name
              fuseServants.search(svtName)[0]?.item ?? null;

    if (svt === null) {
        // If svt is still null, it must be an enemy
        let enemy = await ((await fetch(`https://api.atlasacademy.io/nice/JP/svt/${svtId}?lang=en`)).json() as Promise<Enemy.Enemy>);

        if (!isEnemy(enemy) || (enemy as any).detail) {
            let error = new Error(`Svt not found — ${svtId === svtId ? svtId : svtName}`);
            throw error;
        }

        svt = enemy;
    }

    if (svt.collectionNo === 336 /* bazett */) {
        if (!bazettNP) {
            bazettNP = await apiConnector.noblePhantasm(1001150);
        }

        svt.noblePhantasms = [bazettNP];
    }

    return svt;
};

export { getSvt, init };
