-- Option lists (Support/Format icons, Langue, Pilotes types) managed via
-- Special:InfothequeCoreOptions instead of hardcoded in SchemaRegistry.
-- ithco_list groups rows into one of the managed lists (e.g.
-- "support-icons", "format-icons", "langue", "pilotes-types");
-- ithco_wikitext is unused (NULL) for the plain suggestion lists
-- (langue, pilotes-types), which have no wikitext of their own.
CREATE TABLE /*_*/ithc_options (
  ithco_id INT UNSIGNED NOT NULL PRIMARY KEY AUTO_INCREMENT,
  ithco_list VARBINARY(32) NOT NULL,
  ithco_sort INT NOT NULL DEFAULT 0,
  ithco_key VARBINARY(64) NOT NULL,
  ithco_label BLOB NOT NULL,
  ithco_wikitext BLOB NULL
) /*$wgDBTableOptions*/;

CREATE INDEX /*i*/ithco_list_sort ON /*_*/ithc_options (ithco_list, ithco_sort);
