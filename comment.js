const { DOMAIN } = process.env;

const regexExtensionFromDB = /_(html|png)$/;

const translatePlatform = platform =>
	platform
		.replace(/^win/, "Windows ")
		.replace(/^darwin/, "macOS")
		.replace(/^linux/, "Linux");

const getPlatform = s => {
	if (s.startsWith("win")) {
		return "win";
	} else if (s.startsWith("darwin")) {
		return "darwin";
	} else if (s.startsWith("linux")) {
		return "linux";
	}
	return null;
};

const makeURL = (id, file, hash, os) =>
	file && file.indexOf(DOMAIN) == -1
		? encodeURI(
				`${DOMAIN}/${id}/${hash}/${os}/${file.replace(
					regexExtensionFromDB,
					".$1"
				)}`
		  )
		: f;

function makeTable(id, platform, hash, keys, images) {
	return `<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>
${keys
		.map(k => {
			const { ref, res, diff } = images[k];
			return `<tr><td><img src="${makeURL(
				id,
				ref,
				hash,
				platform
			)}"></td><td><img src="${makeURL(
				id,
				res,
				hash,
				platform
			)}"></td><td><a target="_blank" href="${makeURL(
				id,
				diff,
				hash,
				platform
			)}">D</a></td></tr>`;
		})
		.join("\n")}
</table>`;
}

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
function generateBody(id, platformImages, platformFailed, hash = "0") {
	return (
		`
# screenshot-tester report

(The *D* link in the rightmost column opens a diff)

` +
		Object.entries(
			Object.entries(platformImages)
				.sort(([platformA], [platformB]) => platformA < platformB)
				.reduce((acc, [platform, v]) => {
					const platformNormalized = getPlatform(platform);
					acc[platformNormalized] = acc[platformNormalized] || {};
					acc[platformNormalized][platform] = v;
					return acc;
				}, {})
		)
			.map(([platformNormalized, v]) => {
				const data = Object.entries(v).map(([platform, v]) => {
					const failed = platformFailed[platform] || [];
					const os = translatePlatform(platform);
					let index;
					const images = v
						.map(v => v.split(":"))
						.reduce((acc, [test, file, type]) => {
							if (test) {
								acc[test] = {
									...(acc[test] || {}),
									[type]: file
								};
							} else {
								index = file;
							}
							return acc;
						}, {});

					const failedTestsKeys = Object.keys(images).filter(
						k => failed.indexOf(k) !== -1
					);
					const passedTestsKeys = Object.keys(images).filter(
						k => failed.indexOf(k) === -1
					);

					const header = `
### ${failedTestsKeys.length > 0 ? "❌" : "✅"} ${os}
${index ? `[Overview](${makeURL(id, index, hash, platform)})` : ""}`;

					const failedList =
						failedTestsKeys.length > 0
							? `
Failed tests:

${makeTable(id, platform, hash, failedTestsKeys, images)}
`
							: "";

					const passedList =
						passedTestsKeys.length > 0
							? `
<summary>Passed tests:</summary>
<details>
${makeTable(id, platform, hash, passedTestsKeys, images)}
</details>`
							: "";

					return header + failedList + passedList;
				});

				return (
					`## ${translatePlatform(platformNormalized)}\n` +
					data.join("\n")
				);
			})
			.join("\n") +
		`
<br>

*This comment was created automatically by [screenshot-tester-server](https://github.com/mischnic/screenshot-tester-server).*`
	);
}

module.exports = generateBody;
