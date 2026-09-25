-- Run only during ph setup. Neovim can exit 0 after a +lua error, so fail explicitly.
local ok, err = pcall(function()
  for name, plugin in pairs(require("lazy.core.config").plugins) do
    assert(vim.uv.fs_stat(plugin.dir), "Missing plugin: " .. name)
  end
  require("lazy").load({ plugins = { "nvim-treesitter", "neo-tree.nvim", "blink.cmp" } })
  -- Blink normally loads on the first InsertEnter/CmdlineEnter. Startup alone
  -- misses asynchronous native-library errors in that path.
  local completion_ready = vim.wait(60000, function()
    return package.loaded["blink.cmp.completion"] ~= nil
  end, 20)
  assert(completion_ready, "Completion initialization failed: " .. vim.v.errmsg)
  local items = require("blink.cmp.fuzzy").fuzzy("person", 6, {
    setup = { { label = "personalHarness", kind = 1 }, { label = "unrelated", kind = 1 } },
  }, "prefix")
  assert(items[1] and items[1].label == "personalHarness", "Completion matching failed")
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
  print("EDITOR_SETUP_OK: completion initialized and matched; all nine required parsers loaded")
end)
if not ok then
  io.stderr:write(tostring(err) .. "\n")
  vim.cmd("cquit 1")
end
