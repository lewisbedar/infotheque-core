<?php

namespace MediaWiki\Extension\InfothequeCore\Api;

use ApiBase;

/**
 * TEMPORARY minimal stub for bisecting a "Caught exception of type Error"
 * that reproduces even on action=paraminfo (which never reaches
 * execute()). If THIS minimal version also fails, the problem is
 * ApiBase/registration itself; if it works, the problem is in the
 * business-logic imports/calls that were here before. Restore from git
 * history once found.
 */
class ApiInfothequeCore extends ApiBase {

	/** @inheritDoc */
	public function execute() {
		$this->getResult()->addValue( null, 'ok', true );
	}

	/** @inheritDoc */
	public function getAllowedParams() {
		return [
			'op' => [
				ApiBase::PARAM_TYPE => [ 'generate', 'parseexisting' ],
				ApiBase::PARAM_REQUIRED => true,
			],
			'schema' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_REQUIRED => true,
			],
			'title' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '{}',
			],
			'rows' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '[]',
			],
			'raw' => [
				ApiBase::PARAM_TYPE => 'string',
				ApiBase::PARAM_DEFAULT => '',
			],
		];
	}

	/** @inheritDoc */
	public function isInternal() {
		return true;
	}

	/** @inheritDoc */
	public function isWriteMode() {
		return false;
	}

	/** @inheritDoc */
	public function needsToken() {
		return false;
	}
}
