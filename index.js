import { login } from 'masto';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const { writeFile } = fs.promises;

const { accessToken, dryRun, url } = yargs(hideBin(process.argv))
    .option('dry-run', { boolean: true, default: false, describe: 'Omit the actual deletion' })
    .option('url', { string: true, describe: 'URL of your mastodon instance', requiresArg: true })
    .option('access-token', { string: true, describe: 'Access token for your mastodon instance', requiresArg: true })
    .argv;

async function main() {
    // Set the threshold of inactivity to six months
    const inactivityThreshold = 6 * 31 * 24 * 60 * 60 * 1000;

    if (url === undefined || accessToken === undefined) {
        console.error('You must provide the --url and --access-token options');
        process.exit(1);
    }

    const masto = await login({ url, accessToken });

    const { id } = await masto.accounts.verifyCredentials();

    const follows = masto.accounts.getFollowingIterable(id);
    const followsToRemove = await filterAccountByLastStatusAt(follows, inactivityThreshold);

    const followers = masto.accounts.getFollowersIterable(id);
    const followersToRemove = await filterAccountByLastStatusAt(followers, inactivityThreshold);

    await writeFile('follows.json', JSON.stringify(followsToRemove, null, 2));
    await writeFile('followers.json', JSON.stringify(followersToRemove, null, 2));

    if (!dryRun) {
        console.log(`Unfollowing ${followsToRemove.length} accounts...`);
        for (const account of followsToRemove) {
            await masto.accounts.unfollow(account.id);
        }

        console.log(`Removing ${followersToRemove.length} followers...`);
        for (const account of followersToRemove) {
            await masto.accounts.block(account.id);
            await masto.accounts.unblock(account.id);
        }

        return;
    }

    console.log('Dry run, no changes made');
    console.log('Follows to remove:', followsToRemove.length);
    console.log('Followers to remove:', followersToRemove.length);
}

async function filterAccountByLastStatusAt(accounts, inactivityThreshold) {
    const result = [];

    for await (const batch of accounts) {
        for (const account of batch) {

            if (new Date(account.lastStatusAt) < Date.now() - inactivityThreshold) {
                result.push(account);
            }
        }
    }

    return result;
}

await main();
