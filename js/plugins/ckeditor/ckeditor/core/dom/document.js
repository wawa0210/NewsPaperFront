




CKEDITOR.dom.document = function( domDocument ) {
	CKEDITOR.dom.domObject.call( this, domDocument );
};

// PACKAGER_RENAME( CKEDITOR.dom.document )

CKEDITOR.dom.document.prototype = new CKEDITOR.dom.domObject();

CKEDITOR.tools.extend( CKEDITOR.dom.document.prototype, {
	
	type: CKEDITOR.NODE_DOCUMENT,

	
	appendStyleSheet: function( cssFileUrl ) {
		if ( this.$.createStyleSheet )
			this.$.createStyleSheet( cssFileUrl );
		else {
			var link = new CKEDITOR.dom.element( 'link' );
			link.setAttributes( {
				rel: 'stylesheet',
				type: 'text/css',
				href: cssFileUrl
			} );

			this.getHead().append( link );
		}
	},

	
	appendStyleText: function( cssStyleText ) {
		if ( this.$.createStyleSheet ) {
			var styleSheet = this.$.createStyleSheet( '' );
			styleSheet.cssText = cssStyleText;
		} else {
			var style = new CKEDITOR.dom.element( 'style', this );
			style.append( new CKEDITOR.dom.text( cssStyleText, this ) );
			this.getHead().append( style );
		}

		return styleSheet || style.$.sheet;
	},

	
	createElement: function( name, attribsAndStyles ) {
		var element = new CKEDITOR.dom.element( name, this );

		if ( attribsAndStyles ) {
			if ( attribsAndStyles.attributes )
				element.setAttributes( attribsAndStyles.attributes );

			if ( attribsAndStyles.styles )
				element.setStyles( attribsAndStyles.styles );
		}

		return element;
	},

	
	createText: function( text ) {
		return new CKEDITOR.dom.text( text, this );
	},

	
	focus: function() {
		this.getWindow().focus();
	},

	
	getActive: function() {
		var $active;
		try {
			$active = this.$.activeElement;
		} catch ( e ) {
			return null;
		}
		return new CKEDITOR.dom.element( $active );
	},

	
	getById: function( elementId ) {
		var $ = this.$.getElementById( elementId );
		return $ ? new CKEDITOR.dom.element( $ ) : null;
	},

	
	getByAddress: function( address, normalized ) {
		var $ = this.$.documentElement;

		for ( var i = 0; $ && i < address.length; i++ ) {
			var target = address[ i ];

			if ( !normalized ) {
				$ = $.childNodes[ target ];
				continue;
			}

			var currentIndex = -1;

			for ( var j = 0; j < $.childNodes.length; j++ ) {
				var candidate = $.childNodes[ j ];

				if ( normalized === true && candidate.nodeType == 3 && candidate.previousSibling && candidate.previousSibling.nodeType == 3 )
					continue;

				currentIndex++;

				if ( currentIndex == target ) {
					$ = candidate;
					break;
				}
			}
		}

		return $ ? new CKEDITOR.dom.node( $ ) : null;
	},

	
	getElementsByTag: function( tagName, namespace ) {
		if ( !( CKEDITOR.env.ie && ( document.documentMode <= 8 ) ) && namespace )
			tagName = namespace + ':' + tagName;
		return new CKEDITOR.dom.nodeList( this.$.getElementsByTagName( tagName ) );
	},

	
	getHead: function() {
		var head = this.$.getElementsByTagName( 'head' )[ 0 ];
		if ( !head )
			head = this.getDocumentElement().append( new CKEDITOR.dom.element( 'head' ), true );
		else
			head = new CKEDITOR.dom.element( head );

		return head;
	},

	
	getBody: function() {
		return new CKEDITOR.dom.element( this.$.body );
	},

	
	getDocumentElement: function() {
		return new CKEDITOR.dom.element( this.$.documentElement );
	},

	
	getWindow: function() {
		return new CKEDITOR.dom.window( this.$.parentWindow || this.$.defaultView );
	},

	
	write: function( html ) {
		// Don't leave any history log in IE. (#5657)
		this.$.open( 'text/html', 'replace' );

		// Support for custom document.domain in IE.
		//
		// The script must be appended because if placed before the
		// doctype, IE will go into quirks mode and mess with
		// the editable, e.g. by changing its default height.
		if ( CKEDITOR.env.ie )
			html = html.replace( /(?:^\s*<!DOCTYPE[^>]*?>)|^/i, '$&\n<script data-cke-temp="1">(' + CKEDITOR.tools.fixDomain + ')();</script>' );

		this.$.write( html );
		this.$.close();
	},

	
	find: function( selector ) {
		return new CKEDITOR.dom.nodeList( this.$.querySelectorAll( selector ) );
	},

	
	findOne: function( selector ) {
		var el = this.$.querySelector( selector );

		return el ? new CKEDITOR.dom.element( el ) : null;
	},

	
	_getHtml5ShivFrag: function() {
		var $frag = this.getCustomData( 'html5ShivFrag' );

		if ( !$frag ) {
			$frag = this.$.createDocumentFragment();
			CKEDITOR.tools.enableHtml5Elements( $frag, true );
			this.setCustomData( 'html5ShivFrag', $frag );
		}

		return $frag;
	}
} );
