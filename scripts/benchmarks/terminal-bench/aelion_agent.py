"""Harbor adapter: runs the AelionBot headless CLI inside the task container."""

import os
import shlex
from pathlib import Path
from typing import override

from harbor.agents.installed.base import BaseInstalledAgent, with_prompt_template
from harbor.environments.base import BaseEnvironment
from harbor.models.agent.context import AgentContext

BUNDLE = Path(os.environ.get("AELION_BUNDLE", str(Path.home() / "bundle" / "aelion.tar.gz")))
NODE = "/opt/aelion/node/bin/node"
CLI = "/opt/aelion/dist-electron/cli.cjs"
# Model settings are read from the harbor process environment and forwarded to the CLI.
FORWARDED = (
    "AELION_API_KEY",
    "AELION_BASE_URL",
    "AELION_PROTOCOL",
    "AELION_MODEL",
    "AELION_REASONING_EFFORT",
    "AELION_CONTEXT_TOKENS",
    "AELION_HOSTED_WEB_SEARCH",
    "AELION_DISABLED_TOOLS",
)


class AelionAgent(BaseInstalledAgent):
    @staticmethod
    @override
    def name() -> str:
        return "aelion"

    @override
    async def install(self, environment: BaseEnvironment) -> None:
        await environment.upload_file(BUNDLE, "/installed-agent/aelion.tar.gz")
        await self.exec_as_root(
            environment,
            command=(
                # Debian 11 security packages left deb.debian.org; the verifier installs curl with apt, so point it at the archive.
                "if . /etc/os-release 2>/dev/null && [ \"$VERSION_CODENAME\" = bullseye ] && [ -f /etc/apt/sources.list ]; then "
                "sed -i -E \"s#https?://(deb|security)[.]debian[.]org/debian-security#http://archive.debian.org/debian-security#; "
                "s#https?://deb[.]debian[.]org/debian#http://archive.debian.org/debian#\" /etc/apt/sources.list; fi; "
                "mkdir -p /opt && tar -xzf /installed-agent/aelion.tar.gz -C /opt && "
                "rm -f /installed-agent/aelion.tar.gz && chmod -R a+rX /opt/aelion && "
                f"{NODE} --version"
            ),
        )

    @override
    def populate_context_post_run(self, context: AgentContext) -> None:
        pass

    @override
    @with_prompt_template
    async def run(self, instruction: str, environment: BaseEnvironment, context: AgentContext) -> None:
        env = {key: value for key in FORWARDED if (value := self._get_env(key))}
        if not env.get("AELION_API_KEY") or not env.get("AELION_MODEL"):
            raise ValueError("AELION_API_KEY and AELION_MODEL must be set for the harbor process")
        logs = str(self.environment_logs_dir)
        # The data dir lives under the mounted log dir so the transcript survives a timeout kill.
        # Exit status is recorded instead of raised so the verifier always grades the workspace.
        command = (
            f"mkdir -p {logs}/aelion-data; "
            f"printf %s {shlex.quote(instruction)} > {logs}/instruction.txt; "
            f"AELION_CONFIG_HOME={logs}/aelion-config {NODE} {CLI} --workspace \"$PWD\" --data-dir {logs}/aelion-data --permission full "
            f"< {logs}/instruction.txt > {logs}/aelion-reply.txt 2> {logs}/aelion-progress.txt; "
            f"code=$?; echo $code > {logs}/aelion-exit-code.txt; "
            f"tail -c 2000 {logs}/aelion-progress.txt; exit 0"
        )
        await self.exec_as_agent(environment, command=command, env=env)
