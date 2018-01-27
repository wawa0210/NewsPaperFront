


CKEDITOR.htmlParser.basicWriter = CKEDITOR.tools.createClass( {
	
	$: function() {
		this._ = {
			output: []
		};
	},

	proto: {
		
		openTag: function( tagName ) {
			this._.output.push( '<', tagName );
		},

		
		openTagClose: function( tagName, isSelfClose ) {
			if ( isSelfClose )
				this._.output.push( ' />' );
			else
				this._.output.push( '>' );
		},

		
		attribute: function( attName, attValue ) {
			// Browsers don't always escape special character in attribute values. (#4683, #4719).
			if ( typeof attValue == 'string' )
				attValue = CKEDITOR.tools.htmlEncodeAttr( attValue );

			this._.output.push( ' ', attName, '="', attValue, '"' );
		},

		
		closeTag: function( tagName ) {
			this._.output.push( '</', tagName, '>' );
		},

		
		text: function( text ) {
			this._.output.push( text );
		},

		
		comment: function( comment ) {
			this._.output.push( '<!--', comment, '-->' );
		},

		
		write: function( data ) {
			this._.output.push( data );
		},

		
		reset: function() {
			this._.output = [];
			this._.indent = false;
		},

		
		getHtml: function( reset ) {
			var html = this._.output.join( '' );

			if ( reset )
				this.reset();

			return html;
		}
	}
} );
