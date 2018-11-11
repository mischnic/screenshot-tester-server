import {
	DataDocument,
	DataList,
	FailedList,
	FileDescriptionType,
	MapType
} from "./types";

const { DOMAIN } = process.env;

const regexExtensionFromDB = /_(html|png)$/;

const translatePlatform = (platform: string) =>
	platform
		.replace(/^win/, "Windows ")
		.replace(/^darwin/, "macOS")
		.replace(/^linux/, "Linux");

type OS = "win" | "darwin" | "linux";

const getPlatform = (s: string): OS => {
	if (s.startsWith("win")) {
		return "win";
	} else if (s.startsWith("darwin")) {
		return "darwin";
	} else if (s.startsWith("linux")) {
		return "linux";
	}
	return null;
};

const makeURL = (id: string, file: string, hash: string, os: string) => {
	if (file && file.indexOf(DOMAIN) == -1) {
		return encodeURI(
			`${DOMAIN}/${id}/${hash}/${os}/${file.replace(
				regexExtensionFromDB,
				".$1"
			)}`
		);
	} else return file;
};

interface ImageList {
	[key: string]: ImageRow;
}

interface ImageRow {
	res: string;
	ref: string;
	diff: string;
}

function makeTable(
	id: string,
	platform: string,
	hash: string,
	keys: string[],
	images: ImageList
): string {
	return (
		`<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>` +
		keys
			.map((k: string) => {
				const { ref, res, diff } = images[k];
				let result = `<tr><td>`;

				if (ref) {
					result += `<img src="${makeURL(id, ref, hash, platform)}">`;
				} else result += "?";

				result += `</td><td>`;

				if (res) {
					result += `<img src="${makeURL(id, res, hash, platform)}">`;
				} else result += "?";

				result += `</td><td>`;

				if (diff) {
					result += `<a target="_blank" href="${makeURL(
						id,
						diff,
						hash,
						platform
					)}">D</a>`;
				}
				return result + `</td></tr>`;
			})
			.join("\n") +
		`</table>`
	);
}

const collator = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: "base"
});

type NormalizedDataList = { [os in OS]: DataList };

/*

id:
	"mischnic/screenshot-tester/2"

platformImages:
	{
		'darwin - Node 10': [
			':index.html:',
			'area-adv:reference/darwin/area-adv.js.png:ref'
		]
	}

platformFailed:
	{ 'darwin - Node 10': [], 'darwin - Node 8': [] }

*/
export default function generateBody(
	id: string,
	images: DataList,
	failed: FailedList,
	hash = "0"
): string {
	let output = `# screenshot-tester report\n\n(The *D* link in the rightmost column opens a diff)`;

	const normalizedImages = Object.entries(images)
		.sort(([a], [b]) => collator.compare(a, b))
		.reduce(
			(acc, [platform, d]) => {
				const os = getPlatform(platform);
				acc[os][platform] = d;
				return acc;
			},
			{ win: {}, darwin: {}, linux: {} } as NormalizedDataList
		);

	for (let [os, data] of Object.entries(normalizedImages)) {
		if (Object.keys(data).length === 0) continue;

		output += `\n## ${translatePlatform(os)}\n\n`;

		let platformsOutput = "";

		const platformStatus: MapType<boolean> = {};

		for (let [platform, images] of Object.entries(data).sort(([a], [b]) =>
			collator.compare(a, b)
		)) {
			const mappedImages: ImageList = images.reduce(
				(acc, { name, path, type }) => {
					acc[name] = acc[name] || { ref: "", res: "", diff: "" };
					acc[name][
						((type as any) as keyof ImageRow) || "res"
					] = path;
					return acc;
				},
				{} as ImageList
			);

			let index: string;
			if (mappedImages[""]) {
				index = mappedImages[""].res;
				delete mappedImages[""];
			}

			const failedPlatformKeys = Object.keys(mappedImages).filter(k =>
				failed[platform].includes(k)
			);

			const passedPlatformKeys = Object.keys(mappedImages).filter(
				k => !failed[platform].includes(k)
			);

			platformsOutput += `\n### ${translatePlatform(platform)}\n\n`;

			if (index) {
				platformsOutput += `[Overview](${makeURL(
					id,
					index,
					hash,
					platform
				)})\n\n`;
			}

			if (failedPlatformKeys.length > 0) {
				platformsOutput += "Failed tests\n";
				platformsOutput +=
					makeTable(
						id,
						platform,
						hash,
						failedPlatformKeys,
						mappedImages
					) + "\n";
				platformStatus[platform] = false;
			} else {
				platformsOutput += "**All tests passed**\n";
				platformStatus[platform] = true;
			}

			if (passedPlatformKeys.length > 0) {
				platformsOutput +=
					"<details>" +
					"<summary>Passed tests</summary>\n" +
					makeTable(
						id,
						platform,
						hash,
						passedPlatformKeys,
						mappedImages
					) +
					"</details>\n";
			}
		}

		output +=
			"|" +
			Object.keys(platformStatus)
				.map(translatePlatform)
				.join("|") +
			"|\n";
		output +=
			"|" +
			Object.keys(platformStatus)
				.map(() => ":-:")
				.join("|") +
			"|\n";
		output +=
			"|" +
			Object.values(platformStatus)
				.map(v => (v ? "✅" : "❌"))
				.join("|") +
			"|\n";

		output += platformsOutput;
	}

	return output + `\n<br>\n\n*This comment was created automatically by [screenshot-tester-server](https://github.com/mischnic/screenshot-tester-server).*`;
}
