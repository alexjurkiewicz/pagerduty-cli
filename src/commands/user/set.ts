/* eslint-disable complexity */
import Command from '../../base'
import {CliUx, Flags} from '@oclif/core'
import chalk from 'chalk'
import getStream from 'get-stream'
import * as utils from '../../utils'

export default class UserSet extends Command {
  static description = 'Set PagerDuty User attributes'

  static flags = {
    ...Command.flags,
    emails: Flags.string({
      char: 'e',
      description: 'Select users whose emails contain the given text. Specify multiple times for multiple emails.',
      multiple: true,
    }),
    exact_emails: Flags.string({
      char: 'E',
      description: 'Select a user whose login email is this exact text.  Specify multiple times for multiple emails.',
      multiple: true,
    }),
    ids: Flags.string({
      char: 'i',
      description: 'Select users with the given ID. Specify multiple times for multiple users.',
      multiple: true,
    }),
    key: Flags.string({
      char: 'k',
      description: 'Attribute key to set',
      required: true,
    }),
    value: Flags.string({
      char: 'v',
      description: 'Attribute value to set',
      required: true,
    }),
    pipe: Flags.boolean({
      char: 'p',
      description: 'Read user ID\'s from stdin.',
      exclusive: ['email', 'ids'],
    }),
  }

  async run() {
    const {flags} = await this.parse(UserSet)

    if (!(flags.emails || flags.exact_emails || flags.ids || flags.pipe)) {
      this.error('You must specify at least one of: -i, -e, -E, -p', {exit: 1})
    }

    let user_ids: string[] = []
    if (flags.emails) {
      CliUx.ux.action.start('Getting user IDs from PD')
      user_ids = await this.pd.userIDsForEmails(flags.emails)
    }
    if (flags.exact_emails) {
      CliUx.ux.action.start('Getting user IDs from PD')
      for (const email of flags.exact_emails) {
        // eslint-disable-next-line no-await-in-loop
        const user_id = await this.pd.userIDForEmail(email)
        if (user_id) user_ids = [...new Set([...user_ids, user_id])]
      }
    }
    if (flags.ids) {
      user_ids = [...new Set([...user_ids, ...utils.splitDedupAndFlatten(flags.ids)])]
    }
    if (flags.pipe) {
      const str: string = await getStream(process.stdin)
      user_ids = utils.splitDedupAndFlatten([str])
    }
    if (user_ids.length === 0) {
      this.error('No user ID\'s were found. Please try a different search.', {exit: 1})
    }
    const invalid_ids = utils.invalidPagerDutyIDs(user_ids)
    if (invalid_ids && invalid_ids.length > 0) {
      this.error(`Invalid user ID's: ${invalid_ids.join(', ')}`, {exit: 1})
    }

    const key = flags.key
    const value = flags.value.trim().length > 0 ? flags.value : null

    const requests: any[] = []
    for (const user_id of user_ids) {
      const body: Record<string, any> = utils.putBodyForSetAttribute('user', user_id, key, value)
      requests.push({
        endpoint: `/users/${user_id}`,
        method: 'PUT',
        params: {},
        data: body,
      })
    }

    const r = await this.pd.batchedRequestWithSpinner(requests, {
      activityDescription: `Setting ${chalk.bold.blue(flags.key)} = '${chalk.bold.blue(flags.value)}' on ${requests.length} users`,
    })

    for (const failure of r.getFailedIndices()) {
      // eslint-disable-next-line no-console
      console.error(`${chalk.bold.red('Failed to set user ')}${chalk.bold.blue(requests[failure].data.user.id)}: ${r.results[failure].getFormattedError()}`)
    }
    for (const u of r.getDatas()) {
      if (u.user[key] !== value) {
        // eslint-disable-next-line no-console
        console.error(`${chalk.bold.red('Failed to set value on user ')}${chalk.bold.blue(u.user.id)}`)
      }
    }
  }
}
