<?php

namespace MediaWiki\Extension\InfothequeCore\Generator;

class ValidationMessage {

	public const ERROR = 'error';
	public const WARNING = 'warning';

	public function __construct(
		public readonly string $severity,
		public readonly string $text
	) {
	}
}
