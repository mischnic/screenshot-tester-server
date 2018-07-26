const translatePlatform = platform =>
	platform
		.replace(/^win/, "Windows ")
		.replace(/^darwin/, "macOS")
		.replace(/^linux/, "Linux");

const makeURL = (id, f, hash, os) =>
	f && f.indexOf(DOMAIN) == -1
		? encodeURI(
				`${DOMAIN}/${id}/${hash}/${os}/${f.replace(
					regexExtensionFromDB,
					".$1"
				)}`
		  )
		: f;

function generateBody(id, platformImages, failed, hash = "0") {
	return (
		`
# screenshot-tester report

(The *D* link in the rightmost column opens a diff)

` +
		Object.entries(platformImages)
			.map(([platform, v]) => {
				const myFailed = failed[platform] || [];
				const os = translatePlatform(platform);
				let index;
				const images = v
					.map(v => v.split(":"))
					.reduce((acc, [test, file, type]) => {
						if (test) {
							acc[test] = { ...(acc[test] || {}), [type]: file };
						} else {
							index = file;
						}
						return acc;
					}, {});

				const failedTestsK = Object.keys(images).filter(
					k => myFailed.indexOf(k) !== -1
				);

				const general = `
## ${failedTestsK.length > 0 ? "❌" : "✅"} ${os}
${index ? `[Overview](${makeURL(id, index, hash, platform)})` : ""}

${
					failedTestsK.length > 0
						? `

Failed tests:

<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>
${failedTestsK
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
</table>`
						: `<b>All tests passed</b>`
				}`;
				const passedTestsK = Object.keys(images).filter(
					k => myFailed.indexOf(k) == -1
				);
				const passedList =
					passedTestsK.length == 0
						? ""
						: `
<summary>Passed tests:</summary>
<details>
<table>
	<tr>
		<td>Reference</td>
		<td>Result</td>
	</tr>

${passedTestsK
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
</table>
</details>`;

				return general + passedList;
			})
			.join("\n") +
		`
<br>

*This comment was created automatically by [screenshot-tester-server](https://github.com/mischnic/screenshot-tester-server).*`
	);
}

module.exports = generateBody;
