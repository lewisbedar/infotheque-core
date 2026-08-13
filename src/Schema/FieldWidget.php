<?php

namespace MediaWiki\Extension\InfothequeCore\Schema;

/**
 * The kinds of input widget a schema field can render as.
 */
enum FieldWidget {
	case Text;
	case Textarea;
	case Combobox;
	/** Autocompletes against existing File: pages; stores the bare file name. */
	case File;
}
