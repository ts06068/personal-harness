-- Run only during ph setup. Neovim can exit 0 after a +lua error, so fail explicitly.
local ok, err = pcall(function()
  for name, plugin in pairs(require("lazy.core.config").plugins) do
    assert(vim.uv.fs_stat(plugin.dir), "Missing plugin: " .. name)
  end
  require("lazy").load({ plugins = { "nvim-treesitter", "neo-tree.nvim" } })
  local languages = { "bash", "json", "lua", "markdown", "markdown_inline", "python", "query", "vim", "vimdoc" }
  local installed = require("nvim-treesitter").install(languages, { max_jobs = 2, summary = true }):wait(300000)
  assert(installed, "Parser installation failed; inspect this log and rerun ph setup")
  -- Refresh runtime discovery when site/parser was created after Neovim started.
  vim.opt.runtimepath:prepend(vim.fn.stdpath("data") .. "/site")
  for _, language in ipairs(languages) do
    local loaded, why = vim.treesitter.language.add(language)
    assert(loaded, why or ("Cannot load parser: " .. language))
  end
  assert(vim.fn.exists(":Neotree") == 2, "Neo-tree is unavailable")
  print("EDITOR_SETUP_OK: plugins and all nine required parsers loaded")
end)
if not ok then
  io.stderr:write(tostring(err) .. "\n")
  vim.cmd("cquit 1")
end
