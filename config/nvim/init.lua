local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  local output = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", "https://github.com/folke/lazy.nvim.git", lazypath })
  if vim.v.shell_error ~= 0 then error(output) end
end
vim.opt.rtp:prepend(lazypath)
vim.g.mapleader = " "
vim.g.maplocalleader = "\\"
local treesitter = {
  "nvim-treesitter/nvim-treesitter",
  opts = { ensure_installed = { "bash", "json", "lua", "markdown", "markdown_inline", "python", "query", "vim", "vimdoc" } },
}
if vim.env.PH_SETUP_EDITOR == "1" then
  -- The installer restores plugins first, then explicitly waits for parsers.
  -- Background builds must not outlive one headless process and race the next.
  treesitter.build = false
  treesitter.opts = function(_, opts) opts.ensure_installed = {} end
end
require("lazy").setup({
  spec = {
    { "LazyVim/LazyVim", commit = "999700997f72227187d49d8b92667183dc7fc809", import = "lazyvim.plugins" },
    { import = "lazyvim.plugins.extras.editor.neo-tree" },
    treesitter,
    { "mason-org/mason.nvim", opts = { ensure_installed = {} } },
    { import = "plugins.personal-ui" },
  },
  defaults = { lazy = false, version = false },
  checker = { enabled = false },
  change_detection = { notify = false },
})
vim.opt.clipboard = "unnamedplus"
vim.keymap.set("n", "<leader>af", function()
  local text = "/task add " .. vim.fn.expand("%:p")
  vim.fn.setreg("+", text)
  vim.notify("Copied for the agent: " .. text)
end, { desc = "Copy current file for /task add" })
vim.keymap.set("v", "<leader>as", function()
  local start = vim.fn.line("v")
  local finish = vim.fn.line(".")
  if start > finish then start, finish = finish, start end
  local lines = vim.api.nvim_buf_get_lines(0, start - 1, finish, false)
  local text = vim.fn.expand("%:p") .. ":" .. start .. "-" .. finish .. "\n" .. table.concat(lines, "\n")
  vim.fn.setreg("+", text)
  vim.notify("Selected lines copied for the agent")
end, { desc = "Copy selected context" })
