




CKEDITOR.dom.window = function( domWindow ) {
	CKEDITOR.dom.domObject.call( this, domWindow );
};

CKEDITOR.dom.window.prototype = new CKEDITOR.dom.domObject();

CKEDITOR.tools.extend( CKEDITOR.dom.window.prototype, {
	
	focus: function() {
		this.$.focus();
	},

	
	getViewPaneSize: function() {
		var doc = this.$.document,
			stdMode = doc.compatMode == 'CSS1Compat';
		return {
			width: ( stdMode ? doc.documentElement.clientWidth : doc.body.clientWidth ) || 0,
			height: ( stdMode ? doc.documentElement.clientHeight : doc.body.clientHeight ) || 0
		};
	},

	
	getScrollPosition: function() {
		var $ = this.$;

		if ( 'pageXOffset' in $ ) {
			return {
				x: $.pageXOffset || 0,
				y: $.pageYOffset || 0
			};
		} else {
			var doc = $.document;
			return {
				x: doc.documentElement.scrollLeft || doc.body.scrollLeft || 0,
				y: doc.documentElement.scrollTop || doc.body.scrollTop || 0
			};
		}
	},

	
	getFrame: function() {
		var iframe = this.$.frameElement;
		return iframe ? new CKEDITOR.dom.element.get( iframe ) : null;
	}
} );
