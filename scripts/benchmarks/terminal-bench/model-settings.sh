#!/bin/bash
# Model settings forwarded to the headless CLI. Put the API key in ~/.aelion-key.env, never in this file.
export AELION_BASE_URL=https://<your-endpoint>/v1
export AELION_PROTOCOL=responses
export AELION_MODEL=grok-4.5
export AELION_REASONING_EFFORT=high
export AELION_CONTEXT_TOKENS=500000
# Web and MCP tools, memory, history and skill-writing tools are off, so the agent works from the terminal and files.
export AELION_DISABLED_TOOLS=web_read,chat_pin,message_attach,attachment_read,delegation_receipt,delegation_status,memory,history_search,history_read,mcp_call,mcp_get_prompt,mcp_list_prompts,mcp_list_resource_templates,mcp_list_resources,mcp_list_servers,mcp_list_tools,mcp_read_resource,skill_save,skill_patch,skill_manage,skill_file_write,checkpoint_list,checkpoint_restore
