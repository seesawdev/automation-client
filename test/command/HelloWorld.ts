import {
    ConfigurableCommandHandler,
    MappedParameter,
    MappedParameters,
    Parameter,
} from "../../src/decorators";
import { HandleCommand } from "../../src/HandleCommand";
import {
    ConfigurationAware,
    HandlerContext,
} from "../../src/HandlerContext";
import {
    failure,
    HandlerResult,
    Success,
} from "../../src/HandlerResult";
import {
    addressEvent,
    addressSlackChannels,
    addressSlackUsers,
} from "../../src/spi/message/MessageClient";
import { SecretBaseHandler } from "./SecretBaseHandler";

@ConfigurableCommandHandler("Send a hello back to the client", { intent: "hello cd", autoSubmit: true })
export class HelloWorld extends SecretBaseHandler implements HandleCommand {

    @Parameter({ description: "Name of person the greeting should be send to", pattern: /^.*$/, control: "textarea" })
    public name: string;

    @MappedParameter(MappedParameters.SlackUserName)
    public sender: string;

    public async handle(ctx: HandlerContext): Promise<HandlerResult> {

        const conf = (ctx as any as ConfigurationAware).configuration;

        const helloWorld = {
            sender: {
                name: this.sender,
            },
            recipient: {
                name: this.name,
            },
        };

        await ctx.messageClient.send({ text: "test" }, addressSlackChannels(ctx.teamId, "handlers"));
        await ctx.messageClient.send({ text: "test" }, addressSlackUsers(ctx.teamId, "cd"), { id: null });

        return ctx.messageClient.send(helloWorld, addressEvent("HelloWorld"))
            .then(result => {
                // result.bla.bla;
                return Success;
            })
            .catch(failure);

    }
}
